import 'dotenv/config';
import { createWriteStream, promises as fs } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { Worker } from 'bullmq';
import { supabase } from '@streaming/database';
import { B2StorageProvider } from '@streaming/storage';
import { masterPlaylist, renditions } from '@streaming/video';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const env = z.object({ NEXT_PUBLIC_SUPABASE_URL: z.string().url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), REDIS_URL: z.string().url(), B2_ENDPOINT: z.string().url(), B2_REGION: z.string(), B2_BUCKET: z.string(), B2_ACCESS_KEY_ID: z.string(), B2_SECRET_ACCESS_KEY: z.string(), WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1) }).parse(process.env);
const storage = new B2StorageProvider({ endpoint: env.B2_ENDPOINT, region: env.B2_REGION, bucket: env.B2_BUCKET, accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY });
const run = (command: string, args: string[], onProgress?: (line: string) => void) => new Promise<void>((resolve, reject) => { const process = spawn(command, args); process.stderr.on('data', (chunk) => onProgress?.(chunk.toString())); process.on('error', reject); process.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))); });

const worker = new Worker('video.encode', async (job) => {
  const { videoId, sourceKey, sourceUrl, sourcePath, fileHash } = z.object({ videoId: z.string(), sourceKey: z.string().optional(), sourceUrl: z.string().url().optional(), sourcePath: z.string().optional(), fileHash: z.string().optional() }).refine((d) => d.sourceKey ?? d.sourceUrl ?? d.sourcePath, 'Either sourceKey, sourceUrl or sourcePath is required').parse(job.data);
  const directory = await mkdtemp(join(tmpdir(), `streaming-${videoId}-`));
  const source = join(directory, 'source');
  try {
    const { error: e1 } = await supabase.from('videos').update({ status: 'PROCESSING', encoding_progress: 1, encoding_stage: 'downloading', encoding_error: null }).eq('id', videoId);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('encoding_jobs').update({ state: 'PROCESSING', progress: 1, stage: 'downloading' }).eq('bull_job_id', String(job.id));
    if (e2) throw e2;
    if (sourcePath) {
      await fs.rename(sourcePath, source).catch(() => fs.copyFile(sourcePath, source).then(() => fs.rm(sourcePath, { force: true })));
    } else if (sourceUrl) {
      const response = await fetch(sourceUrl);
      if (!response.ok || !response.body) throw new Error(`Failed to fetch source URL: ${response.status} ${response.statusText}`);
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(source));
    } else {
      await pipeline(await storage.download(sourceKey!), createWriteStream(source));
    }
    for (let index = 0; index < renditions.length; index += 1) {
      const rendition = renditions[index]; const output = join(directory, rendition.name); await fs.mkdir(output);
      const completed = Math.round((index / renditions.length) * 90) + 5;
      const { error: e3 } = await supabase.from('videos').update({ encoding_progress: completed, encoding_stage: 'encoding' }).eq('id', videoId);
      if (e3) throw e3;
      await job.updateProgress(completed);
      await run('ffmpeg', ['-y', '-i', source, '-vf', `scale=-2:${rendition.height}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_filename', join(output, 'segment%05d.ts'), join(output, 'playlist.m3u8')]);
    }
    await fs.writeFile(join(directory, 'master.m3u8'), masterPlaylist(videoId));
    await run('ffmpeg', ['-y', '-ss', '00:00:10', '-i', source, '-frames:v', '1', '-vf', 'scale=1280:-2', join(directory, 'thumbnail.jpg')]);
    const files = (await walk(directory)).filter((file) => /\.(m3u8|ts|jpg)$/i.test(file));
    const { error: e4 } = await supabase.from('videos').update({ encoding_progress: 92, encoding_stage: 'uploading' }).eq('id', videoId);
    if (e4) throw e4;
    for (const file of files) { const fileKey = `video/${videoId}/${relative(directory, file).replaceAll('\\', '/')}`; await storage.upload(fileKey, await fs.readFile(file), contentType(file)); }
    if (sourceKey) { try { await storage.delete(sourceKey); } catch { /* best-effort cleanup */ } }
    const { error: e5 } = await supabase.from('video_renditions').insert(renditions.map((r) => ({ id: nanoid(), video_id: videoId, height: r.height, bandwidth: r.bandwidth, playlist_key: `video/${videoId}/${r.name}/playlist.m3u8`, codec: 'h264' })));
    if (e5) throw e5;
    const { error: e6 } = await supabase.from('videos').update({ status: 'READY', encoding_progress: 100, encoding_stage: 'complete', hls_master_key: `video/${videoId}/master.m3u8`, thumbnail_key: `video/${videoId}/thumbnail.jpg`, ...(fileHash ? { file_hash: fileHash } : {}) }).eq('id', videoId);
    if (e6) throw e6;
    const { error: e7 } = await supabase.from('encoding_jobs').update({ state: 'COMPLETED', progress: 100, stage: 'complete' }).eq('bull_job_id', String(job.id));
    if (e7) throw e7;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Encoding failed';
    await supabase.from('videos').update({ status: 'FAILED', encoding_stage: 'failed', encoding_error: message }).eq('id', videoId);
    await supabase.from('encoding_jobs').update({ state: 'FAILED', error: message }).eq('bull_job_id', String(job.id));
    throw error;
  }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}, { connection: { url: env.REDIS_URL }, concurrency: env.WORKER_CONCURRENCY });
worker.on('failed', (job, error) => console.error(`Encoding job ${job?.id} failed:`, error.message));
worker.on('ready', () => console.log(`Encoding worker ready (concurrency ${env.WORKER_CONCURRENCY})`));

const INACTIVITY_DAYS = 60;
async function runInactivityCleanup() {
  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from('videos')
    .select('id, hls_master_key')
    .not('owner_id', 'is', null)
    .or(`last_viewed_at.lt.${cutoff},and(last_viewed_at.is.null,created_at.lt.${cutoff})`);
  if (!stale?.length) return;
  for (const video of stale) {
    if (video.hls_master_key) await storage.deletePrefix(`video/${video.id}/`).catch(() => {});
    await supabase.from('videos').delete().eq('id', video.id);
  }
  console.log(`Inactivity cleanup: removed ${stale.length} videos inactive for ${INACTIVITY_DAYS}+ days`);
}
(function scheduleCleanup() {
  runInactivityCleanup().catch(err => console.error('Cleanup error:', err));
  setTimeout(scheduleCleanup, 24 * 60 * 60 * 1000);
})();

async function walk(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]))).flat(); }
function contentType(file: string) { if (file.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'; if (file.endsWith('.ts')) return 'video/mp2t'; if (file.endsWith('.jpg')) return 'image/jpeg'; return 'application/octet-stream'; }
