import 'dotenv/config';
import { createWriteStream, promises as fs } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, encodingJobs, videoRenditions, videos } from '@streaming/database';
import { B2StorageProvider } from '@streaming/storage';
import { masterPlaylist, renditions } from '@streaming/video';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const env = z.object({ DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(), B2_ENDPOINT: z.string().url(), B2_REGION: z.string(), B2_BUCKET: z.string(), B2_ACCESS_KEY_ID: z.string(), B2_SECRET_ACCESS_KEY: z.string(), WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1) }).parse(process.env);
const storage = new B2StorageProvider({ endpoint: env.B2_ENDPOINT, region: env.B2_REGION, bucket: env.B2_BUCKET, accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY });
const run = (command: string, args: string[], onProgress?: (line: string) => void) => new Promise<void>((resolve, reject) => { const process = spawn(command, args); process.stderr.on('data', (chunk) => onProgress?.(chunk.toString())); process.on('error', reject); process.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))); });

const worker = new Worker('video.encode', async (job) => {
  const { videoId, sourceKey, sourceUrl } = z.object({ videoId: z.string(), sourceKey: z.string().optional(), sourceUrl: z.string().url().optional() }).refine((d) => d.sourceKey ?? d.sourceUrl, 'Either sourceKey or sourceUrl is required').parse(job.data);
  const directory = await mkdtemp(join(tmpdir(), `streaming-${videoId}-`));
  const source = join(directory, 'source');
  try {
    await db.update(videos).set({ status: 'PROCESSING', encodingProgress: 1, encodingStage: 'downloading', encodingError: null }).where(eq(videos.id, videoId));
    await db.update(encodingJobs).set({ state: 'PROCESSING', progress: 1, stage: 'downloading' }).where(eq(encodingJobs.bullJobId, String(job.id)));
    if (sourceUrl) {
      const response = await fetch(sourceUrl);
      if (!response.ok || !response.body) throw new Error(`Failed to fetch source URL: ${response.status} ${response.statusText}`);
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(source));
    } else {
      await pipeline(await storage.download(sourceKey!), createWriteStream(source));
    }
    for (let index = 0; index < renditions.length; index += 1) {
      const rendition = renditions[index]; const output = join(directory, rendition.name); await fs.mkdir(output);
      const completed = Math.round((index / renditions.length) * 90) + 5;
      await db.update(videos).set({ encodingProgress: completed, encodingStage: 'encoding' }).where(eq(videos.id, videoId));
      await job.updateProgress(completed);
      await run('ffmpeg', ['-y', '-i', source, '-vf', `scale=-2:${rendition.height}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_filename', join(output, 'segment%05d.ts'), join(output, 'playlist.m3u8')]);
    }
    await fs.writeFile(join(directory, 'master.m3u8'), masterPlaylist(videoId));
    await run('ffmpeg', ['-y', '-ss', '00:00:10', '-i', source, '-frames:v', '1', '-vf', 'scale=1280:-2', join(directory, 'thumbnail.jpg')]);
    const files = (await walk(directory)).filter((file) => /\.(m3u8|ts|jpg)$/i.test(file));
    await db.update(videos).set({ encodingProgress: 92, encodingStage: 'uploading' }).where(eq(videos.id, videoId));
    for (const file of files) { const fileKey = `video/${videoId}/${relative(directory, file).replaceAll('\\', '/')}`; await storage.upload(fileKey, await fs.readFile(file), contentType(file)); }
    if (sourceKey) { try { await storage.delete(sourceKey); } catch { /* best-effort cleanup */ } }
    await db.insert(videoRenditions).values(renditions.map((r) => ({ id: nanoid(), videoId, height: r.height, bandwidth: r.bandwidth, playlistKey: `video/${videoId}/${r.name}/playlist.m3u8`, codec: 'h264' })));
    await db.update(videos).set({ status: 'READY', encodingProgress: 100, encodingStage: 'complete', hlsMasterKey: `video/${videoId}/master.m3u8`, thumbnailKey: `video/${videoId}/thumbnail.jpg` }).where(eq(videos.id, videoId));
    await db.update(encodingJobs).set({ state: 'COMPLETED', progress: 100, stage: 'complete' }).where(eq(encodingJobs.bullJobId, String(job.id)));
  } catch (error) { const message = error instanceof Error ? error.message : 'Encoding failed'; await db.update(videos).set({ status: 'FAILED', encodingStage: 'failed', encodingError: message }).where(eq(videos.id, videoId)); await db.update(encodingJobs).set({ state: 'FAILED', error: message }).where(eq(encodingJobs.bullJobId, String(job.id))); throw error; }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}, { connection: { url: env.REDIS_URL }, concurrency: env.WORKER_CONCURRENCY });
worker.on('failed', (job, error) => console.error(`Encoding job ${job?.id} failed:`, error.message));
worker.on('ready', () => console.log(`Encoding worker ready (concurrency ${env.WORKER_CONCURRENCY})`));

async function walk(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]))).flat(); }
function contentType(file: string) { if (file.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'; if (file.endsWith('.ts')) return 'video/mp2t'; if (file.endsWith('.jpg')) return 'image/jpeg'; return 'application/octet-stream'; }
