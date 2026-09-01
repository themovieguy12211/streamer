import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { createHash } from 'node:crypto';
import { createWriteStream, promises as fsApi } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Queue } from 'bullmq';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { supabase, toCamel } from '@streaming/database';
import { B2StorageProvider } from '@streaming/storage';
import { ConfiguredAdProvider } from '@streaming/ads';
import { createSession, deleteSession, getCurrentUser, hashPassword, sessionCookie, verifyPassword } from './auth.js';
import { env } from './config.js';

function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    out[sk] = v;
  }
  return out;
}

const app = Fastify({ logger: true });
const queue = new Queue('video.encode', { connection: { url: env.REDIS_URL } });
const storage = new B2StorageProvider({ endpoint: env.B2_ENDPOINT, region: env.B2_REGION, bucket: env.B2_BUCKET, accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY });
const ads = new ConfiguredAdProvider({ popAdsScriptUrl: env.POPADS_SCRIPT_URL, vastTagUrl: env.VAST_TAG_URL });
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', signed: false };

await app.register(cookie);
await app.register(cors, { origin: true, credentials: true });
await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_BYTES } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(sensible);
app.setErrorHandler((caught, _request, reply) => { const error = caught as Error & { statusCode?: number }; app.log.error(error); reply.code(error.statusCode ?? 500).send({ error: 'REQUEST_FAILED', message: error.message }); });
app.get('/health', async () => ({ ok: true }));

const requireUser = async (request: typeof app extends never ? never : any) => { const user = await getCurrentUser(request); if (!user) throw app.httpErrors.unauthorized('Authentication required'); return user; };
const requireAdmin = async (request: any) => { const user = await requireUser(request); if (user.role !== 'ADMIN') throw app.httpErrors.forbidden('Admin role required'); return user; };
const requireVideoOwner = async (request: any, videoId: string) => { const user = await requireUser(request); if (user.role === 'ADMIN') return user; const { data } = await supabase.from('videos').select('owner_id').eq('id', videoId).limit(1); if (!data?.[0] || data[0].owner_id !== user.id) throw app.httpErrors.forbidden('Not your video'); return user; };

app.post('/api/v1/auth/register', async (request, reply) => {
  const body = z.object({ email: z.string().email(), username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/), password: z.string().min(12).max(128), displayName: z.string().min(1).max(100) }).parse(request.body);
  const email = body.email.toLowerCase();
  const role = env.ADMIN_EMAILS.split(',').map((value) => value.trim().toLowerCase()).includes(email) ? 'ADMIN' as const : 'USER' as const;
  const id = nanoid();
  const { error: insErr } = await supabase.from('users').insert({ id, email, username: body.username, display_name: body.displayName, password_hash: await hashPassword(body.password), role, account_status: 'ACTIVE' });
  if (insErr) throw insErr;
  const session = await createSession(id);
  reply.setCookie(sessionCookie, session.token, { ...cookieOptions, expires: session.expiresAt }).code(201).send({ user: { id, email, username: body.username, displayName: body.displayName, role, isPremium: false } });
});

app.post('/api/v1/auth/login', async (request, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const { data: userData, error: userErr } = await supabase.from('users').select('*').eq('email', body.email.toLowerCase()).limit(1);
  if (userErr) throw userErr;
  const user = userData?.map(r => toCamel<any>(r))[0];
  if (!user || !(await verifyPassword(user.passwordHash, body.password))) throw app.httpErrors.unauthorized('Invalid email or password');
  if (user.accountStatus !== 'ACTIVE') throw app.httpErrors.forbidden('Account unavailable');
  const { error: updErr } = await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
  if (updErr) throw updErr;
  const session = await createSession(user.id);
  reply.setCookie(sessionCookie, session.token, { ...cookieOptions, expires: session.expiresAt }).send({ user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, role: user.role, isPremium: false } });
});

app.post('/api/v1/auth/logout', async (request, reply) => { await deleteSession(request.cookies[sessionCookie]); reply.clearCookie(sessionCookie, { path: '/' }).code(204).send(); });
app.get('/api/v1/auth/me', async (request) => ({ user: await getCurrentUser(request) }));

app.get('/api/v1/videos', async (request) => {
  const query = z.object({ page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(50).default(24), q: z.string().max(200).optional() }).parse(request.query);
  const offset = (query.page - 1) * query.limit;
  let q = supabase.from('videos').select('*').eq('status', 'PUBLISHED').eq('visibility', 'PUBLIC').order('created_at', { ascending: false }).range(offset, offset + query.limit - 1);
  if (query.q) q = (q as any).or(`title.ilike.%${query.q}%,description.ilike.%${query.q}%`);
  const { data: rows, error: videoErr } = await q;
  if (videoErr) throw videoErr;
  const data = (rows ?? []).map(r => toCamel<any>(r));
  return { data, page: query.page };
});

app.get('/api/v1/videos/:id', async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const { data: videoData, error: videoErr } = await supabase.from('videos').select('*').eq('id', id).limit(1);
  if (videoErr) throw videoErr;
  const video = videoData?.map(r => toCamel<any>(r))[0];
  if (!video) throw app.httpErrors.notFound('Video not found');
  const user = await getCurrentUser(request);
  const isOwner = user?.id && video.ownerId === user.id;
  const isAdmin = user?.role === 'ADMIN';
  const isPubliclyWatchable = video.status === 'PUBLISHED' && video.visibility === 'PUBLIC';
  const isDirectLinkWatchable = video.status === 'READY';
  if (!isPubliclyWatchable && !isDirectLinkWatchable && !isOwner && !isAdmin) {
    throw app.httpErrors.notFound('Video not found');
  }
  const { data: histData, error: histErr } = user ? await supabase.from('watch_history').select('*').eq('user_id', user.id).eq('video_id', id).limit(1) : { data: [] as any[], error: null };
  if (histErr) throw histErr;
  const history = histData?.map(r => toCamel<any>(r))[0];
  const rawHlsUrl = video.externalHlsUrl ?? (video.hlsMasterKey && env.B2_PUBLIC_BASE_URL ? `${env.B2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${video.hlsMasterKey}` : null);
  const adConfiguration = await ads.getConfiguration({ videoId: id, isPremium: Boolean(user?.isPremium) });
  return { video, streamUrl: rawHlsUrl, hlsUrl: (user?.role === 'ADMIN' || user?.isPremium) ? rawHlsUrl : null, resumePositionSeconds: history?.positionSeconds ?? 0, ads: adConfiguration };
});

app.post('/api/v1/videos', async (request, reply) => {
  const user = await requireUser(request);
  const body = z.object({ title: z.string().min(1).max(255), slug: z.string().min(1).max(280).regex(/^[a-z0-9-]+$/).optional(), tmdbId: z.number().int().positive().optional(), contentType: z.enum(['MOVIE', 'EPISODE']).default('MOVIE'), episodeNumber: z.number().int().positive().optional(), seasonNumber: z.number().int().positive().optional() }).parse(request.body);
  const id = nanoid();
  const slug = body.slug ?? `${body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${nanoid(6)}`;
  const { error } = await supabase.from('videos').insert({ id, title: body.title, slug, status: 'DRAFT', owner_id: user.id, tmdb_id: body.tmdbId ?? null, content_type: body.contentType, episode_number: body.episodeNumber ?? null });
  if (error) throw error;
  reply.code(201).send({ video: { id, title: body.title, slug, status: 'DRAFT' } });
});

app.post('/api/v1/videos/:id/external-hls', async (request) => {
  await requireAdmin(request);
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ url: z.string().url().max(2048).refine((url) => new URL(url).protocol === 'https:' && new URL(url).pathname.toLowerCase().includes('.m3u8'), 'A HTTPS .m3u8 URL is required') }).parse(request.body);
  const { error } = await supabase.from('videos').update({ external_hls_url: body.url, hls_master_key: null, status: 'READY', encoding_progress: 100, encoding_stage: 'external-hls' }).eq('id', id);
  if (error) throw error;
  return { status: 'READY', source: 'external-hls' };
});

app.post('/api/v1/series', async (request, reply) => {
  await requireAdmin(request);
  const body = z.object({ title: z.string().min(1).max(255), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().max(10000).optional(), tmdbId: z.number().int().positive().optional(), posterPath: z.string().max(512).optional(), backdropPath: z.string().max(512).optional() }).parse(request.body);
  const record = { id: nanoid(), ...body };
  const { error } = await supabase.from('series').insert({ id: record.id, title: body.title, slug: body.slug, description: body.description, tmdb_id: body.tmdbId, poster_path: body.posterPath, backdrop_path: body.backdropPath });
  if (error) throw error;
  reply.code(201).send({ series: record });
});

app.post('/api/v1/series/:seriesId/seasons', async (request, reply) => {
  await requireAdmin(request);
  const { seriesId } = z.object({ seriesId: z.string() }).parse(request.params);
  const body = z.object({ seasonNumber: z.number().int().min(0), title: z.string().max(255).optional(), tmdbId: z.number().int().positive().optional(), posterPath: z.string().max(512).optional() }).parse(request.body);
  const id = nanoid();
  const record = { id, seriesId, ...body };
  const { error } = await supabase.from('seasons').insert({ id, series_id: seriesId, season_number: body.seasonNumber, title: body.title, tmdb_id: body.tmdbId, poster_path: body.posterPath });
  if (error) throw error;
  reply.code(201).send({ season: record });
});

app.get('/api/v1/admin/tmdb/:mediaType/:tmdbId', async (request) => {
  await requireAdmin(request);
  if (!env.TMDB_API_KEY) throw app.httpErrors.serviceUnavailable('TMDB_API_KEY is not configured');
  const { mediaType, tmdbId } = z.object({ mediaType: z.enum(['movie', 'tv']), tmdbId: z.coerce.number().int().positive() }).parse(request.params);
  const response = await fetch(`${env.TMDB_BASE_URL}/${mediaType}/${tmdbId}?language=en-US`, { headers: { Authorization: `Bearer ${env.TMDB_API_KEY}`, accept: 'application/json' } });
  if (!response.ok) throw app.httpErrors.notFound('TMDb title not found');
  const item = await response.json() as { id: number; title?: string; name?: string; overview?: string; poster_path?: string; backdrop_path?: string; release_date?: string; first_air_date?: string; seasons?: unknown[] };
  return { tmdb: { id: item.id, title: item.title ?? item.name, description: item.overview, posterPath: item.poster_path, backdropPath: item.backdrop_path, releaseDate: item.release_date ?? item.first_air_date, seasons: item.seasons ?? [] } };
});

const adminContentInput = z.object({ title: z.string().min(1).max(255), slug: z.string().min(1).max(280).regex(/^[a-z0-9-]+$/), description: z.string().max(10000).optional(), hlsUrl: z.string().url().max(2048).refine((url) => new URL(url).protocol === 'https:' && new URL(url).pathname.toLowerCase().includes('.m3u8'), 'A HTTPS .m3u8 URL is required').optional(), published: z.boolean().default(false), seriesTitle: z.string().min(1).max(255).optional() });
const adminVideoValues = (body: z.infer<typeof adminContentInput>, extra: { contentType: 'MOVIE' | 'EPISODE'; tmdbId?: number; seasonId?: string; episodeNumber?: number }) => ({ title: body.title, slug: body.slug, description: body.description, externalHlsUrl: body.hlsUrl ?? null, hlsMasterKey: null, status: body.hlsUrl ? (body.published ? 'PUBLISHED' as const : 'READY' as const) : 'DRAFT' as const, visibility: body.published ? 'PUBLIC' as const : 'PRIVATE' as const, encodingProgress: body.hlsUrl ? 100 : 0, encodingStage: body.hlsUrl ? 'external-hls' : null, ...extra });

app.get('/api/v1/admin/content/:tmdbId', async (request) => {
  await requireAdmin(request);
  const { tmdbId } = z.object({ tmdbId: z.coerce.number().int().positive() }).parse(request.params);
  const { data, error } = await supabase.from('videos').select('*').eq('tmdb_id', tmdbId).eq('content_type', 'MOVIE').limit(1);
  if (error) throw error;
  const video = data?.map(r => toCamel<any>(r))[0] ?? null;
  return { video };
});

app.get('/api/v1/admin/content/:tmdbId/:seasonNumber/:episodeNumber', async (request) => {
  await requireAdmin(request);
  const input = z.object({ tmdbId: z.coerce.number().int().positive(), seasonNumber: z.coerce.number().int().min(0), episodeNumber: z.coerce.number().int().positive() }).parse(request.params);
  const { data: showData, error: showErr } = await supabase.from('series').select('*').eq('tmdb_id', input.tmdbId).limit(1);
  if (showErr) throw showErr;
  const show = showData?.map(r => toCamel<any>(r))[0];
  if (!show) return { series: null, season: null, video: null };
  const { data: seasonData, error: seasonErr } = await supabase.from('seasons').select('*').eq('series_id', show.id).eq('season_number', input.seasonNumber).limit(1);
  if (seasonErr) throw seasonErr;
  const season = seasonData?.map(r => toCamel<any>(r))[0];
  const { data: videoData, error: videoErr } = season ? await supabase.from('videos').select('*').eq('season_id', season.id).eq('episode_number', input.episodeNumber).limit(1) : { data: [] as any[], error: null };
  if (videoErr) throw videoErr;
  const video = videoData?.map(r => toCamel<any>(r))[0] ?? null;
  return { series: show, season: season ?? null, video };
});

app.put('/api/v1/admin/content/:tmdbId', async (request) => {
  await requireAdmin(request);
  const { tmdbId } = z.object({ tmdbId: z.coerce.number().int().positive() }).parse(request.params);
  const body = adminContentInput.parse(request.body);
  const values = adminVideoValues(body, { contentType: 'MOVIE', tmdbId });
  const { data: existData, error: existErr } = await supabase.from('videos').select('id, status').eq('tmdb_id', tmdbId).eq('content_type', 'MOVIE').limit(1);
  if (existErr) throw existErr;
  const existing = existData?.[0];
  const videoId = existing?.id ?? nanoid();
  if (existing) {
    if (body.hlsUrl) {
      const { error: updErr } = await supabase.from('videos').update(toSnake(values as unknown as Record<string, unknown>)).eq('id', existing.id);
      if (updErr) throw updErr;
    } else {
      const s = body.published ? 'PUBLISHED' : existing.status === 'PUBLISHED' ? 'READY' : existing.status;
      const { error: updErr } = await supabase.from('videos').update({ title: body.title, slug: body.slug, description: body.description, visibility: body.published ? 'PUBLIC' : 'PRIVATE', status: s }).eq('id', existing.id);
      if (updErr) throw updErr;
    }
  } else {
    const { error: insErr } = await supabase.from('videos').insert({ id: videoId, ...toSnake(values as unknown as Record<string, unknown>) });
    if (insErr) throw insErr;
  }
  return { ok: true, videoId };
});

app.put('/api/v1/admin/content/:tmdbId/:seasonNumber/:episodeNumber', async (request) => {
  await requireAdmin(request);
  const input = z.object({ tmdbId: z.coerce.number().int().positive(), seasonNumber: z.coerce.number().int().min(0), episodeNumber: z.coerce.number().int().positive() }).parse(request.params);
  const body = adminContentInput.parse(request.body);
  const { data: showData, error: showErr } = await supabase.from('series').select('*').eq('tmdb_id', input.tmdbId).limit(1);
  if (showErr) throw showErr;
  let show: any = showData?.map(r => toCamel<any>(r))[0];
  if (!show) {
    const id = nanoid();
    const { error: insErr } = await supabase.from('series').insert({ id, tmdb_id: input.tmdbId, title: body.seriesTitle ?? `TMDb ${input.tmdbId}`, slug: `tmdb-${input.tmdbId}` });
    if (insErr) throw insErr;
    const { data: newShowData, error: newShowErr } = await supabase.from('series').select('*').eq('id', id).limit(1);
    if (newShowErr) throw newShowErr;
    show = newShowData?.map(r => toCamel<any>(r))[0];
  }
  const { data: seasonData, error: seasonErr } = await supabase.from('seasons').select('*').eq('series_id', show.id).eq('season_number', input.seasonNumber).limit(1);
  if (seasonErr) throw seasonErr;
  let season: any = seasonData?.map(r => toCamel<any>(r))[0];
  if (!season) {
    const id = nanoid();
    const { error: insErr } = await supabase.from('seasons').insert({ id, series_id: show.id, season_number: input.seasonNumber, title: `Season ${input.seasonNumber}` });
    if (insErr) throw insErr;
    const { data: newSeasonData, error: newSeasonErr } = await supabase.from('seasons').select('*').eq('id', id).limit(1);
    if (newSeasonErr) throw newSeasonErr;
    season = newSeasonData?.map(r => toCamel<any>(r))[0];
  }
  const values = adminVideoValues(body, { contentType: 'EPISODE', seasonId: season.id, episodeNumber: input.episodeNumber });
  const { data: existData, error: existErr } = await supabase.from('videos').select('id, status').eq('season_id', season.id).eq('episode_number', input.episodeNumber).limit(1);
  if (existErr) throw existErr;
  const existing = existData?.[0];
  const videoId = existing?.id ?? nanoid();
  if (existing) {
    if (body.hlsUrl) {
      const { error: updErr } = await supabase.from('videos').update(toSnake(values as unknown as Record<string, unknown>)).eq('id', existing.id);
      if (updErr) throw updErr;
    } else {
      const s = body.published ? 'PUBLISHED' : existing.status === 'PUBLISHED' ? 'READY' : existing.status;
      const { error: updErr } = await supabase.from('videos').update({ title: body.title, slug: body.slug, description: body.description, visibility: body.published ? 'PUBLIC' : 'PRIVATE', status: s }).eq('id', existing.id);
      if (updErr) throw updErr;
    }
  } else {
    const { error: insErr } = await supabase.from('videos').insert({ id: videoId, ...toSnake(values as unknown as Record<string, unknown>) });
    if (insErr) throw insErr;
  }
  return { ok: true, videoId, seriesId: show.id, seasonId: season.id };
});

app.get('/api/v1/ads/config/:videoId', async (request) => { const { videoId } = z.object({ videoId: z.string() }).parse(request.params); const user = await getCurrentUser(request); return ads.getConfiguration({ videoId, isPremium: Boolean(user?.isPremium) }); });

app.post('/api/v1/videos/:id/upload', async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  await requireVideoOwner(request, id);
  const data = await request.file();
  if (!data) throw app.httpErrors.badRequest('No file provided');
  const tempPath = join(tmpdir(), `streaming-src-${id}-${nanoid()}`);
  const hash = createHash('sha256');
  const hashTransform = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); this.push(chunk); cb(); } });
  await pipeline(data.file, hashTransform, createWriteStream(tempPath));
  const fileHash = hash.digest('hex');
  // Deduplication: check if identical content is already encoded
  const { data: existing } = await supabase.from('videos').select('hls_master_key, thumbnail_key, duration_seconds').eq('file_hash', fileHash).eq('status', 'READY').not('hls_master_key', 'is', null).limit(1);
  if (existing?.[0]) {
    const { hls_master_key, thumbnail_key, duration_seconds } = existing[0];
    await supabase.from('videos').update({ status: 'READY', encoding_progress: 100, encoding_stage: 'deduplicated', hls_master_key, thumbnail_key, duration_seconds, file_hash: fileHash }).eq('id', id);
    await fsApi.rm(tempPath, { force: true });
    return { jobId: null, status: 'READY', deduplicated: true };
  }
  const { error: vidErr } = await supabase.from('videos').update({ status: 'QUEUED', encoding_progress: 0, encoding_stage: 'queued', file_hash: fileHash }).eq('id', id);
  if (vidErr) throw vidErr;
  const job = await queue.add('video.encode', { videoId: id, sourcePath: tempPath, fileHash }, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100, removeOnFail: 500 });
  const { error: jobErr } = await supabase.from('encoding_jobs').insert({ id: nanoid(), video_id: id, bull_job_id: String(job.id), state: 'QUEUED', stage: 'queued' });
  if (jobErr) throw jobErr;
  return { jobId: job.id, status: 'QUEUED' };
});

app.post('/api/v1/videos/:id/import-url', async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  await requireVideoOwner(request, id);
  const body = z.object({ url: z.string().url().max(2048) }).parse(request.body);
  const { data: videoCheck, error: vidCheckErr } = await supabase.from('videos').select('id').eq('id', id).limit(1);
  if (vidCheckErr) throw vidCheckErr;
  if (!videoCheck?.length) throw app.httpErrors.notFound('Video not found');
  const { error: vidErr } = await supabase.from('videos').update({ status: 'QUEUED', encoding_progress: 0, encoding_stage: 'queued', encoding_error: null }).eq('id', id);
  if (vidErr) throw vidErr;
  const job = await queue.add('video.encode', { videoId: id, sourceUrl: body.url }, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100, removeOnFail: 500 });
  const { error: jobErr } = await supabase.from('encoding_jobs').insert({ id: nanoid(), video_id: id, bull_job_id: String(job.id), state: 'QUEUED', stage: 'queued' });
  if (jobErr) throw jobErr;
  return { jobId: job.id, status: 'QUEUED' };
});

app.get('/api/v1/videos/:id/status', async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  await requireVideoOwner(request, id);
  const { data, error } = await supabase.from('videos').select('status, encoding_progress, encoding_stage, encoding_error').eq('id', id).limit(1);
  if (error) throw error;
  if (!data?.length) throw app.httpErrors.notFound();
  const row = data[0];
  return { status: row.status, progress: row.encoding_progress, stage: row.encoding_stage, error: row.encoding_error };
});

app.get('/api/v1/watch-history', async (request) => {
  const user = await requireUser(request);
  const { data: histData, error: histErr } = await supabase.from('watch_history').select('*').eq('user_id', user.id).order('last_watched_at', { ascending: false }).limit(20);
  if (histErr) throw histErr;
  const videoIds = (histData ?? []).map((r: any) => r.video_id);
  if (!videoIds.length) return { data: [] };
  const { data: vData, error: vErr } = await supabase.from('videos').select('*').in('id', videoIds);
  if (vErr) throw vErr;
  const videoMap: Record<string, any> = Object.fromEntries((vData ?? []).map(r => [r.id, toCamel<any>(r)]));
  const data = (histData ?? []).map((r: any) => ({ ...toCamel<any>(r), video: videoMap[r.video_id] })).filter((r: any) => r.video);
  return { data };
});
app.get('/api/v1/admin/videos', async (request) => {
  await requireAdmin(request);
  const query = z.object({ page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(50) }).parse(request.query);
  const offset = (query.page - 1) * query.limit;
  const { data, error, count } = await supabase.from('videos').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + query.limit - 1);
  if (error) throw error;
  return { data: (data ?? []).map(r => toCamel<any>(r)), total: count ?? 0, page: query.page };
});
app.get('/api/v1/tmdb/:tmdbId/videos', async (request) => {
  await requireAdmin(request);
  const { tmdbId } = z.object({ tmdbId: z.coerce.number().int().positive() }).parse(request.params);
  const { data, error } = await supabase.from('videos').select('*').eq('tmdb_id', tmdbId).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).map(r => toCamel<any>(r));
  const rawUrls = rows.map(v => v.externalHlsUrl ?? (v.hlsMasterKey && env.B2_PUBLIC_BASE_URL ? `${env.B2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${v.hlsMasterKey}` : null));
  return { data: rows.map((v, i) => ({ ...v, hlsUrl: rawUrls[i], embedUrl: `${env.NEXT_PUBLIC_APP_URL ?? ''}/e/${v.id}` })) };
});
app.get('/api/v1/admin/stats', async (request) => {
  await requireAdmin(request);
  const [published, processing, failed, total] = await Promise.all([
    supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
    supabase.from('videos').select('id', { count: 'exact', head: true }).in('status', ['QUEUED', 'PROCESSING', 'UPLOADING']),
    supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'FAILED'),
    supabase.from('videos').select('id', { count: 'exact', head: true }),
  ]);
  return { published: published.count ?? 0, processing: processing.count ?? 0, failed: failed.count ?? 0, total: total.count ?? 0 };
});
app.post('/api/v1/watch-history', async (request) => {
  const user = await requireUser(request);
  const body = z.object({ videoId: z.string(), positionSeconds: z.number().int().min(0), durationSeconds: z.number().int().positive(), watchedSeconds: z.number().int().min(0) }).parse(request.body);
  const { error } = await supabase.from('watch_history').upsert({ user_id: user.id, video_id: body.videoId, position_seconds: body.positionSeconds, duration_seconds: body.durationSeconds, watched_seconds: body.watchedSeconds, last_watched_at: new Date().toISOString() }, { onConflict: 'user_id,video_id' });
  if (error) throw error;
  return { ok: true };
});

app.get('/api/v1/watchlist', async (request) => {
  const user = await requireUser(request);
  const { data: wlData, error: wlErr } = await supabase.from('watchlists').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (wlErr) throw wlErr;
  const videoIds = (wlData ?? []).map((r: any) => r.video_id);
  let videoRows: { video: any }[] = [];
  if (videoIds.length > 0) {
    const { data: vData, error: vErr } = await supabase.from('videos').select('*').in('id', videoIds);
    if (vErr) throw vErr;
    const videoMap: Record<string, any> = Object.fromEntries((vData ?? []).map(r => [r.id, toCamel<any>(r)]));
    videoRows = videoIds.map((id: string) => ({ video: videoMap[id] })).filter((item: any) => item.video);
  }
  return { data: videoRows };
});

app.post('/api/v1/watchlist', async (request) => {
  const user = await requireUser(request);
  const { videoId } = z.object({ videoId: z.string() }).parse(request.body);
  const { error } = await supabase.from('watchlists').upsert({ user_id: user.id, video_id: videoId }, { onConflict: 'user_id,video_id', ignoreDuplicates: true });
  if (error) throw error;
  return { ok: true };
});

app.delete('/api/v1/watchlist/:videoId', async (request, reply) => {
  const user = await requireUser(request);
  const { videoId } = z.object({ videoId: z.string() }).parse(request.params);
  const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('video_id', videoId);
  if (error) throw error;
  reply.code(204).send();
});

app.get('/api/v1/my-videos', async (request) => {
  const user = await requireUser(request);
  const { data, error } = await supabase.from('videos').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return { data: (data ?? []).map(r => toCamel<any>(r)) };
});

app.patch('/api/v1/my-videos/:id', async (request) => {
  const user = await requireUser(request);
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ title: z.string().min(1).max(255).optional(), visibility: z.enum(['PRIVATE', 'PUBLIC']).optional() }).parse(request.body);
  const { data: check } = await supabase.from('videos').select('owner_id, status').eq('id', id).limit(1);
  if (!check?.[0] || check[0].owner_id !== user.id) throw app.httpErrors.forbidden('Not your video');
  const updates: Record<string, unknown> = {};
  if (body.title) updates.title = body.title;
  if (body.visibility) { updates.visibility = body.visibility; if (body.visibility === 'PUBLIC' && check[0].status === 'READY') updates.status = 'PUBLISHED'; if (body.visibility === 'PRIVATE' && check[0].status === 'PUBLISHED') updates.status = 'READY'; }
  const { error } = await supabase.from('videos').update(updates).eq('id', id);
  if (error) throw error;
  return { ok: true };
});

app.delete('/api/v1/my-videos/:id', async (request, reply) => {
  const user = await requireUser(request);
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const { data: check } = await supabase.from('videos').select('owner_id, hls_master_key').eq('id', id).limit(1);
  if (!check?.[0] || check[0].owner_id !== user.id) throw app.httpErrors.forbidden('Not your video');
  const { error } = await supabase.from('videos').delete().eq('id', id);
  if (error) throw error;
  if (check[0].hls_master_key) storage.deletePrefix(`video/${id}/`).catch(() => {});
  reply.code(204).send();
});

app.post('/api/v1/videos/:id/view', async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  await supabase.rpc('increment_view_count', { p_video_id: id });
  await supabase.from('videos').update({ last_viewed_at: new Date().toISOString() }).eq('id', id);
  return { ok: true };
});

app.post('/api/v1/ad-events', async (request) => {
  const body = z.object({ videoId: z.string(), eventType: z.enum(['REQUEST', 'IMPRESSION', 'START', 'COMPLETE', 'ERROR']), adDurationSeconds: z.number().int().positive().optional() }).parse(request.body);
  const user = await getCurrentUser(request);
  const revenueMicros = body.eventType === 'COMPLETE' ? Math.round((env.CPM_RATE / 1000) * env.REVENUE_SHARE * 1_000_000) : 0;
  const { error } = await supabase.from('ad_events').insert({ id: nanoid(), video_id: body.videoId, user_id: user?.id ?? null, event_type: body.eventType, ad_duration_seconds: body.adDurationSeconds ?? null, revenue_micros: revenueMicros });
  if (error) throw error;
  return { ok: true };
});

app.get('/api/v1/earnings', async (request) => {
  const user = await requireUser(request);
  const { data: myVideos, error: vErr } = await supabase.from('videos').select('id, view_count, title').eq('owner_id', user.id);
  if (vErr) throw vErr;
  const videoIds = (myVideos ?? []).map((v: any) => v.id);
  const totalViews = (myVideos ?? []).reduce((sum: number, v: any) => sum + (v.view_count ?? 0), 0);
  let revenueMicros = 0;
  if (videoIds.length > 0) {
    const { data: adData, error: adErr } = await supabase.from('ad_events').select('revenue_micros').in('video_id', videoIds).eq('event_type', 'COMPLETE');
    if (adErr) throw adErr;
    revenueMicros = (adData ?? []).reduce((sum: number, e: any) => sum + (e.revenue_micros ?? 0), 0);
  }
  const { data: pendingWd, error: wdErr } = await supabase.from('withdrawal_requests').select('amount_micros').eq('user_id', user.id).in('status', ['PENDING', 'APPROVED']);
  if (wdErr) throw wdErr;
  const pendingMicros = (pendingWd ?? []).reduce((sum: number, w: any) => sum + (w.amount_micros ?? 0), 0);
  const balanceMicros = revenueMicros - pendingMicros;
  return { totalViews, revenueMicros, balanceMicros, balanceUsd: (balanceMicros / 1_000_000).toFixed(4), revenueUsd: (revenueMicros / 1_000_000).toFixed(4), cpmRate: env.CPM_RATE, revenueShare: env.REVENUE_SHARE, videoBreakdown: (myVideos ?? []).map((v: any) => ({ id: v.id, title: v.title, views: v.view_count ?? 0, estimatedUsd: ((v.view_count ?? 0) / 1000 * env.CPM_RATE * env.REVENUE_SHARE).toFixed(4) })) };
});

app.post('/api/v1/withdrawals', async (request) => {
  const user = await requireUser(request);
  const body = z.object({ amountUsd: z.number().positive().min(5), method: z.string().min(1).max(64), address: z.string().min(1).max(512) }).parse(request.body);
  const { error } = await supabase.from('withdrawal_requests').insert({ id: nanoid(), user_id: user.id, amount_micros: Math.round(body.amountUsd * 1_000_000), method: body.method, address: body.address, status: 'PENDING' });
  if (error) throw error;
  return { ok: true };
});

app.get('/api/v1/admin/withdrawals', async (request) => {
  await requireAdmin(request);
  const { data, error } = await supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
  const { data: users } = userIds.length ? await supabase.from('users').select('id, username, email, display_name').in('id', userIds) : { data: [] };
  const userMap: Record<string, any> = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));
  return { data: (data ?? []).map((r: any) => ({ ...toCamel<any>(r), user: userMap[r.user_id] ? toCamel<any>(userMap[r.user_id]) : null })) };
});

app.patch('/api/v1/admin/withdrawals/:id', async (request) => {
  await requireAdmin(request);
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PAID']), note: z.string().max(500).optional() }).parse(request.body);
  const { error } = await supabase.from('withdrawal_requests').update({ status: body.status, note: body.note ?? null, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return { ok: true };
});

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
