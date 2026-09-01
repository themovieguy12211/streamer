'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Existing = {
  video: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    externalHlsUrl: string | null;
    status: string;
    encodingProgress: number | null;
    encodingStage: string | null;
    encodingError: string | null;
  } | null;
  series?: { title: string } | null;
};

type EncodeStatus = { status: string; progress: number | null; stage: string | null; error: string | null };
type SourceMode = 'external-hls' | 'import-url' | 'upload-file' | 'keep-source';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function ContentEditor({ tmdbId, season, episode }: { tmdbId: string; season?: string; episode?: string }) {
  const isEpisode = Boolean(season && episode);
  const path = isEpisode ? `/admin/content/${tmdbId}/${season}/${episode}` : `/admin/content/${tmdbId}`;

  const [form, setForm] = useState({ title: '', slug: '', description: '', hlsUrl: '', importUrl: '', published: false, seriesTitle: '', sourceMode: 'external-hls' as SourceMode });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [encodeStatus, setEncodeStatus] = useState<EncodeStatus | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'uploading' | 'encoding' | 'saved' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [watchUrl, setWatchUrl] = useState('');

  useEffect(() => {
    fetch(`/api/v1${path}`, { credentials: 'include' }).then(async (response) => {
      if (response.status === 401 || response.status === 403) throw new Error('Sign in with an ADMIN account to edit media.');
      if (!response.ok) throw new Error('Could not load this media record.');
      const data: Existing = await response.json();
      const video = data.video;
      const activeEncode = video && ['QUEUED', 'PROCESSING'].includes(video.status);
      if (video) setVideoId(video.id);
      if (activeEncode && video) setEncodeStatus({ status: video.status, progress: video.encodingProgress, stage: video.encodingStage, error: video.encodingError });
      const hasEncodedSource = video && !video.externalHlsUrl && ['READY', 'PUBLISHED', 'QUEUED', 'PROCESSING', 'UPLOADING'].includes(video.status);
      setForm({ title: video?.title ?? '', slug: video?.slug ?? '', description: video?.description ?? '', hlsUrl: video?.externalHlsUrl ?? '', importUrl: '', published: video?.status === 'PUBLISHED', seriesTitle: data.series?.title ?? '', sourceMode: hasEncodedSource ? 'keep-source' : 'external-hls' });
      setState(activeEncode ? 'encoding' : 'ready');
    }).catch((error: Error) => { setMessage(error.message); setState('error'); });
  }, [path]);

  useEffect(() => {
    if (!videoId || !encodeStatus || !['QUEUED', 'PROCESSING'].includes(encodeStatus.status)) return;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/videos/${videoId}/status`, { credentials: 'include' });
        if (!response.ok) return;
        const status: EncodeStatus = await response.json();
        setEncodeStatus(status);
        if (status.status === 'READY' || status.status === 'PUBLISHED') { setState('saved'); setMessage('Encoding complete. Video is ready.'); setWatchUrl(`/watch/${videoId}`); }
        else if (status.status === 'FAILED') { setState('error'); setMessage(status.error ?? 'Encoding failed.'); }
      } catch { /* retry next tick */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [videoId, encodeStatus]);

  const update = (field: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));

  const loadTmdb = async () => {
    setState('saving');
    try {
      const response = await fetch(`/api/v1/admin/tmdb/${isEpisode ? 'tv' : 'movie'}/${tmdbId}`, { credentials: 'include' });
      if (!response.ok) throw new Error(response.status === 503 ? 'TMDb lookup is disabled because TMDB_API_KEY is not configured.' : 'TMDb title was not found.');
      const { tmdb } = await response.json();
      setForm((f) => ({ ...f, title: tmdb.title ?? f.title, slug: f.slug || slugify(tmdb.title ?? ''), description: tmdb.description ?? f.description, seriesTitle: isEpisode ? tmdb.title ?? f.seriesTitle : f.seriesTitle }));
      setState('ready');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'TMDb lookup failed.'); setState('error'); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('saving');
    try {
      const payload = { title: form.title, slug: form.slug, description: form.description, hlsUrl: form.sourceMode === 'external-hls' ? form.hlsUrl : undefined, published: form.published, seriesTitle: form.seriesTitle };
      const response = await fetch(`/api/v1${path}`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? 'Save failed.'); }
      const body = await response.json();
      const vid: string = body.videoId;
      setVideoId(vid);
      setWatchUrl(`/watch/${vid}`);

      if (form.sourceMode === 'external-hls') {
        setState('saved'); setMessage('Saved.');
      } else if (form.sourceMode === 'import-url') {
        if (!form.importUrl) throw new Error('No import URL provided.');
        const importResp = await fetch(`/api/v1/videos/${vid}/import-url`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: form.importUrl }) });
        if (!importResp.ok) { const b = await importResp.json().catch(() => null); throw new Error(b?.message ?? 'Failed to start import.'); }
        setState('encoding'); setEncodeStatus({ status: 'QUEUED', progress: 0, stage: 'queued', error: null }); setMessage('Import queued. Encoding in progress...');
      } else if (form.sourceMode === 'upload-file') {
        if (!uploadFile) throw new Error('No file selected.');
        setState('uploading'); setUploadProgress(0);
        const uploadResp = await fetch(`/api/v1/videos/${vid}/upload`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: uploadFile.name, contentType: uploadFile.type || 'video/mp4', sizeBytes: uploadFile.size }) });
        if (!uploadResp.ok) { const b = await uploadResp.json().catch(() => null); throw new Error(b?.message ?? 'Failed to start upload.'); }
        const { uploadUrl, key } = await uploadResp.json();
        await uploadWithProgress(uploadUrl, uploadFile, setUploadProgress);
        const completeResp = await fetch(`/api/v1/videos/${vid}/upload/complete`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, fileName: uploadFile.name, contentType: uploadFile.type || 'video/mp4', sizeBytes: uploadFile.size }) });
        if (!completeResp.ok) { const b = await completeResp.json().catch(() => null); throw new Error(b?.message ?? 'Failed to complete upload.'); }
        setState('encoding'); setEncodeStatus({ status: 'QUEUED', progress: 0, stage: 'queued', error: null }); setMessage('Upload complete. Encoding in progress...');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed.'); setState('error'); }
  };

  const isBusy = state === 'saving' || state === 'uploading' || state === 'encoding';
  const encodePercent = encodeStatus?.progress ?? 0;
  const buttonLabel = state === 'saving' ? 'Saving...' : state === 'uploading' ? `Uploading ${uploadProgress}%...` : state === 'encoding' ? 'Encoding...' : 'Save media';

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <Link className="brand" href="/">Northstar</Link>
        <span className="muted">Admin / TMDb {tmdbId}{isEpisode ? ` / Season ${season} / Episode ${episode}` : ' / Movie'}</span>
      </header>
      <section className="editor">
        <div className="editorTitle">
          <div><span className="eyebrow">Media editor</span><h1>{isEpisode ? `Episode ${episode}` : 'Movie'}</h1></div>
          <button type="button" className="button secondary" disabled={isBusy} onClick={() => void loadTmdb()}>Fill from TMDb</button>
        </div>
        {state === 'loading' ? <div className="empty">Loading editor...</div> : (
          <form onSubmit={save} className="editorForm">
            {isEpisode && <label>Series title<input required value={form.seriesTitle} onChange={(e) => update('seriesTitle', e.target.value)} placeholder="Series title" /></label>}
            <label>Title<input required value={form.title} onChange={(e) => { update('title', e.target.value); if (!form.slug) update('slug', slugify(e.target.value)); }} placeholder="Title" /></label>
            <label>Slug<input required value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} placeholder="title-slug" /></label>
            <label className="wide">Description<textarea value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Description" rows={5} /></label>

            <div className="wide">
              <div className="sourceTabs">
                {form.sourceMode === 'keep-source' && <button type="button" className="sourceTab active">Encoded source</button>}
                <button type="button" className={`sourceTab${form.sourceMode === 'external-hls' ? ' active' : ''}`} onClick={() => setForm((f) => ({ ...f, sourceMode: 'external-hls' }))}>External HLS URL</button>
                <button type="button" className={`sourceTab${form.sourceMode === 'import-url' ? ' active' : ''}`} onClick={() => setForm((f) => ({ ...f, sourceMode: 'import-url' }))}>Import from URL</button>
                <button type="button" className={`sourceTab${form.sourceMode === 'upload-file' ? ' active' : ''}`} onClick={() => setForm((f) => ({ ...f, sourceMode: 'upload-file' }))}>Upload file</button>
              </div>
              {form.sourceMode === 'keep-source' && (
                <p className="formState" style={{ margin: 0 }}>Video is encoded and ready — source will be preserved. Switch tabs above to replace the source.</p>
              )}
              {form.sourceMode === 'external-hls' && (
                <label>HLS master playlist URL<input required type="url" value={form.hlsUrl} onChange={(e) => update('hlsUrl', e.target.value)} placeholder="https://media.example.com/path/master.m3u8" /></label>
              )}
              {form.sourceMode === 'import-url' && (
                <label>Video URL to import<input required type="url" value={form.importUrl} onChange={(e) => update('importUrl', e.target.value)} placeholder="https://example.com/video.mp4" /></label>
              )}
              {form.sourceMode === 'upload-file' && (
                <label>Video file<input required type="file" accept="video/*" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></label>
              )}
            </div>

            {(state === 'uploading' || state === 'encoding') && (
              <div className="wide">
                <div className="encodeStatus">
                  <span>{state === 'uploading' ? `Uploading... ${uploadProgress}%` : `${encodeStatus?.stage ?? 'encoding'}... ${encodePercent}%`}</span>
                  <div className="progressBar"><div className="progressFill" style={{ width: `${state === 'uploading' ? uploadProgress : encodePercent}%` }} /></div>
                </div>
              </div>
            )}

            <label className="toggle"><input type="checkbox" checked={form.published} onChange={(e) => update('published', e.target.checked)} /><span>Publish publicly</span></label>
            <div className="formFooter">
              <span className={state === 'error' ? 'formError' : 'formState'}>{message}{watchUrl && state === 'saved' && <> <Link href={watchUrl}>Open video</Link></>}</span>
              <button className="button" disabled={isBusy}>{buttonLabel}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); });
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
}
