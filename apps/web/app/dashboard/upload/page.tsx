'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type EncodeStatus = { status: string; progress: number | null; stage: string | null; error: string | null };
type SourceMode = 'upload-file' | 'import-url';

function uploadToB2(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
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

export default function UploadPage() {
  const [title, setTitle] = useState('');
  const [tmdbId, setTmdbId] = useState('');
  const [isEpisode, setIsEpisode] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('upload-file');
  const [importUrl, setImportUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [encodeStatus, setEncodeStatus] = useState<EncodeStatus | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'creating' | 'uploading' | 'encoding' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll encoding status
  useEffect(() => {
    if (!videoId || !encodeStatus || !['QUEUED', 'PROCESSING'].includes(encodeStatus.status)) return;
    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/videos/${videoId}/status`, { credentials: 'include' });
        if (!response.ok) return;
        const status: EncodeStatus = await response.json();
        setEncodeStatus(status);
        if (status.status === 'READY' || status.status === 'PUBLISHED') {
          setState('ready');
          setMessage('Your video is ready!');
        } else if (status.status === 'FAILED') {
          setState('error');
          setMessage(status.error ?? 'Encoding failed. Please try again.');
        }
      } catch { /* retry */ }
    }, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [videoId, encodeStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setState('creating');
    setMessage('');
    try {
      // Step 1: create video record
      const createResp = await fetch('/api/v1/videos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
        title: title.trim(),
        ...(tmdbId.trim() ? { tmdbId: parseInt(tmdbId) } : {}),
        ...(isEpisode && episodeNumber ? { contentType: 'EPISODE', episodeNumber: parseInt(episodeNumber), ...(seasonNumber ? { seasonNumber: parseInt(seasonNumber) } : {}) } : {}),
      }),
      });
      if (!createResp.ok) {
        const b = await createResp.json().catch(() => null);
        throw new Error(b?.message ?? 'Failed to create video.');
      }
      const { video } = await createResp.json();
      const vid: string = video.id;
      setVideoId(vid);

      if (sourceMode === 'import-url') {
        // Step 2b: import from URL
        if (!importUrl.trim()) throw new Error('Please provide a video URL.');
        const importResp = await fetch(`/api/v1/videos/${vid}/import-url`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: importUrl.trim() }),
        });
        if (!importResp.ok) { const b = await importResp.json().catch(() => null); throw new Error(b?.message ?? 'Failed to start import.'); }
        setState('encoding');
        setEncodeStatus({ status: 'QUEUED', progress: 0, stage: 'queued', error: null });
        setMessage('Import queued. Encoding in progress...');
      } else {
        // Step 2a: upload file directly to server
        if (!uploadFile) throw new Error('Please select a video file.');
        setState('uploading');
        setUploadProgress(0);
        setState('uploading'); setUploadProgress(0);
        // Use DIRECT_API_URL to bypass the Next.js proxy for large file uploads
        const directApi = process.env.NEXT_PUBLIC_DIRECT_API_URL ?? '/api/v1';
        const uploadResp = await fetch(`${directApi}/videos/${vid}/upload`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: uploadFile.name, contentType: uploadFile.type || 'video/mp4', sizeBytes: uploadFile.size }) });
        if (!uploadResp.ok) { const b = await uploadResp.json().catch(() => null); throw new Error(b?.message ?? 'Failed to start upload.'); }
        const uploadData = await uploadResp.json();
        if (uploadData.uploadUrl) {
          // Presigned URL mode (fallback when no direct API)
          await uploadToB2(uploadData.uploadUrl, uploadFile, setUploadProgress);
          const completeResp = await fetch(`${directApi}/videos/${vid}/upload/complete`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: uploadData.key, fileName: uploadFile.name, contentType: uploadFile.type || 'video/mp4', sizeBytes: uploadFile.size }) });
          if (!completeResp.ok) { const b = await completeResp.json().catch(() => null); throw new Error(b?.message ?? 'Failed to complete upload.'); }
          const completeData = await completeResp.json();
          if (completeData.deduplicated) { setState('ready'); setMessage('Your video is ready!'); return; }
        } else if (uploadData.deduplicated) {
          setState('ready'); setMessage('Your video is ready!'); return;
        }
        setState('encoding'); setEncodeStatus({ status: 'QUEUED', progress: 0, stage: 'queued', error: null }); setMessage('Upload complete. Encoding in progress...');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setState('error');
    }
  };

  const isBusy = state === 'creating' || state === 'uploading' || state === 'encoding';
  const encodePercent = encodeStatus?.progress ?? 0;
  const progressValue = state === 'uploading' ? uploadProgress : encodePercent;
  const progressLabel =
    state === 'creating' ? 'Creating...' :
    state === 'uploading' ? `Uploading ${uploadProgress}%` :
    state === 'encoding' ? `${encodeStatus?.stage ?? 'encoding'}... ${encodePercent}%` : '';

  const shareUrl = videoId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/watch/${videoId}` : '';

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <Link className="brand" href="/">Northstar</Link>
        <nav style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link href="/dashboard" className="muted">Dashboard</Link>
        </nav>
      </header>

      <section style={{ paddingTop: '52px', maxWidth: '600px' }}>
        <div style={{ marginBottom: '28px' }}>
          <span className="eyebrow">Upload</span>
          <h1 style={{ color: 'var(--ink)', fontSize: '42px', margin: '6px 0 0' }}>Share a video</h1>
        </div>

        {state === 'ready' && videoId ? (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ padding: '24px', background: '#e6f4f1', border: '1px solid #0b635b', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 16px', fontWeight: 700, color: 'var(--teal)', fontSize: '16px' }}>Your video is ready!</p>
              <p className="muted" style={{ margin: '0 0 16px', fontSize: '13px' }}>Share this link with anyone — no login required to watch.</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Link href={`/watch/${videoId}`} className="button">Watch video</Link>
                <button
                  className="button"
                  style={{ background: '#dbe2d8', color: 'var(--ink)' }}
                  onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => null)}
                >
                  Copy link
                </button>
              </div>
              <p style={{ margin: '16px 0 0', fontSize: '12px', color: '#68746e', wordBreak: 'break-all' }}>{shareUrl}</p>
            </div>
            <div>
              <Link href="/dashboard" className="muted" style={{ fontSize: '14px' }}>Back to dashboard</Link>
              {' · '}
              <button
                className="muted"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: 0 }}
                onClick={() => { setTitle(''); setImportUrl(''); setUploadFile(null); setVideoId(null); setEncodeStatus(null); setState('idle'); setMessage(''); }}
              >
                Upload another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="authForm">
            <label>
              Video title
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-filled from filename" disabled={isBusy} />
            </label>

            <label className="toggle" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexDirection: 'row' }}>
              <input type="checkbox" checked={isEpisode} onChange={e => setIsEpisode(e.target.checked)} disabled={isBusy} style={{ width: '17px', height: '17px', accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>This is a TV episode</span>
            </label>

            {isEpisode && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  Season
                  <input inputMode="numeric" value={seasonNumber} onChange={e => setSeasonNumber(e.target.value.replace(/\D/g, ''))} placeholder="1" disabled={isBusy} />
                </label>
                <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  Episode
                  <input required={isEpisode} inputMode="numeric" value={episodeNumber} onChange={e => setEpisodeNumber(e.target.value.replace(/\D/g, ''))} placeholder="1" disabled={isBusy} />
                </label>
                <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  TMDb ID <span style={{ fontWeight: 400, color: 'var(--text2)' }}>optional</span>
                  <input inputMode="numeric" value={tmdbId} onChange={e => setTmdbId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 60625" disabled={isBusy} />
                </label>
              </div>
            )}

            {!isEpisode && (
              <label>
                TMDb ID <span style={{ fontWeight: 400, color: 'var(--text2)', fontSize: '12px' }}>optional</span>
                <input inputMode="numeric" value={tmdbId} onChange={e => setTmdbId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 155" disabled={isBusy} />
              </label>
            )}

            <div>
              <div className="sourceTabs" style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  className={`sourceTab${sourceMode === 'upload-file' ? ' active' : ''}`}
                  onClick={() => setSourceMode('upload-file')}
                  disabled={isBusy}
                >
                  Upload file
                </button>
                <button
                  type="button"
                  className={`sourceTab${sourceMode === 'import-url' ? ' active' : ''}`}
                  onClick={() => setSourceMode('import-url')}
                  disabled={isBusy}
                >
                  Import from URL
                </button>
              </div>

              {sourceMode === 'upload-file' && (
                <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 600 }}>
                  Video file
                  <input
                    required
                    type="file"
                    accept="video/*"
                    disabled={isBusy}
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      setUploadFile(file);
                      if (file && !title) {
                        const clean = file.name
                          .replace(/\.[^.]+$/, '')
                          .replace(/[._\-]+/g, ' ')
                          .replace(/\b(720p|1080p|2160p|4k|bluray|webrip|web|hdtv|x264|x265|h264|h265|aac|hevc|mkv|mp4|avi|remux|hdrip)\b/gi, '')
                          .replace(/\s+/g, ' ').trim()
                          .replace(/\b\w/g, c => c.toUpperCase());
                        setTitle(clean);
                      }
                    }}
                    style={{ border: '1px solid #bac5bd', borderRadius: '4px', padding: '10px 12px', background: 'white', font: '400 14px inherit' }}
                  />
                </label>
              )}

              {sourceMode === 'import-url' && (
                <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 600 }}>
                  Video URL
                  <input
                    required
                    type="url"
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    placeholder="https://example.com/video.mp4"
                    disabled={isBusy}
                  />
                </label>
              )}
            </div>

            {(state === 'uploading' || state === 'encoding') && (
              <div className="encodeStatus">
                <span>{progressLabel}</span>
                <div className="progressBar">
                  <div className="progressFill" style={{ width: `${progressValue}%` }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '8px' }}>
              <span className={state === 'error' ? 'formError' : 'formState'}>{message}</span>
              <button className="button" disabled={isBusy}>
                {state === 'creating' ? 'Creating...' : state === 'uploading' ? `Uploading ${uploadProgress}%...` : state === 'encoding' ? 'Encoding...' : 'Upload'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
