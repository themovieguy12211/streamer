'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Stats = { published: number; processing: number; failed: number; total: number };
type Video = { id: string; title: string; status: string; contentType: string; createdAt: string; encodingProgress: number | null; encodingStage: string | null };

const STATUS_COLOUR: Record<string, string> = { PUBLISHED: '#22863a', READY: '#0969da', DRAFT: '#6e7781', QUEUED: '#9a6700', PROCESSING: '#9a6700', UPLOADING: '#9a6700', FAILED: '#cf222e' };

export default function AdminHome() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [tmdbId, setTmdbId] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/admin/stats', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/v1/admin/videos?limit=50', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
    ]).then(([s, v]) => {
      if (s) setStats(s);
      setVideos(v.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const open = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d+$/.test(tmdbId)) return;
    router.push(season && episode ? `/admin/${tmdbId}/${season}/${episode}` : `/admin/${tmdbId}`);
  };

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <Link className="brand" href="/">Northstar</Link>
        <nav style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link href="/" className="muted">View site</Link>
          <Link href="/admin/login" className="muted">Account</Link>
        </nav>
      </header>

      {stats && (
        <div style={{ display: 'flex', gap: '16px', paddingTop: '32px', marginBottom: '32px' }}>
          {[{ label: 'Published', value: stats.published, color: '#22863a' }, { label: 'Processing', value: stats.processing, color: '#9a6700' }, { label: 'Failed', value: stats.failed, color: '#cf222e' }, { label: 'Total', value: stats.total, color: 'var(--ink)' }].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'white', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px 20px' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '13px', color: '#53615c', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start' }}>
        <section>
          <h2 style={{ color: 'var(--ink)', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Content library</h2>
          {loading ? <div className="empty">Loading...</div> : videos.length === 0 ? (
            <div className="empty">No content yet — add a title using the form.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Title', 'Type', 'Status', 'Added'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#53615c', fontWeight: 600, fontSize: '12px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {videos.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--ink)', fontWeight: 500 }}>{v.title}</td>
                    <td style={{ padding: '10px 12px', color: '#53615c' }}>{v.contentType}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: STATUS_COLOUR[v.status] + '22', color: STATUS_COLOUR[v.status], borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 600 }}>
                        {v.status}{v.status === 'PROCESSING' && v.encodingProgress ? ` ${v.encodingProgress}%` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#53615c' }}>{new Date(v.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 style={{ color: 'var(--ink)', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Add content</h2>
          <form className="authForm" onSubmit={open}>
            <label>TMDb ID<input required inputMode="numeric" value={tmdbId} onChange={e => setTmdbId(e.target.value)} placeholder="Movie or series ID" /></label>
            <label>Season <span className="muted" style={{ fontWeight: 400 }}>optional</span><input inputMode="numeric" value={season} onChange={e => setSeason(e.target.value)} placeholder="1" /></label>
            <label>Episode <span className="muted" style={{ fontWeight: 400 }}>optional</span><input inputMode="numeric" value={episode} onChange={e => setEpisode(e.target.value)} placeholder="1" /></label>
            <button className="button">Open editor</button>
          </form>
        </section>
      </div>
    </main>
  );
}
