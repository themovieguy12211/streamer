'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type User = { id: string; displayName: string; username: string; email: string; role: string };
type Video = { id: string; title: string; thumbnailKey: string | null; durationSeconds: number | null };
type HistoryItem = { videoId: string; positionSeconds: number; durationSeconds: number; lastWatchedAt: string; video: Video };
type WatchlistItem = { video: Video };
type MyVideo = { id: string; title: string; status: string; visibility: string; createdAt: string; encodingProgress: number | null };

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', UPLOADING: 'Uploading', QUEUED: 'Queued', PROCESSING: 'Encoding', READY: 'Ready', PUBLISHED: 'Published', FAILED: 'Failed' };
const STATUS_COLOR: Record<string, string> = { DRAFT: '#68746e', UPLOADING: '#b07a20', QUEUED: '#b07a20', PROCESSING: '#b07a20', READY: '#0b635b', PUBLISHED: '#1a7a2e', FAILED: '#af3023' };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [myVideos, setMyVideos] = useState<MyVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/auth/me', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/v1/watch-history', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/v1/watchlist', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/v1/my-videos', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
    ]).then(([me, hist, wl, mv]) => {
      if (!me.user) { window.location.href = '/login'; return; }
      setUser(me.user);
      setHistory(hist.data ?? []);
      setWatchlist(wl.data ?? []);
      setMyVideos(mv.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <main className="adminShell"><div className="empty">Loading...</div></main>;
  if (!user) return null;

  const progressPct = (item: HistoryItem) => item.durationSeconds ? Math.round((item.positionSeconds / item.durationSeconds) * 100) : 0;

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <Link className="brand" href="/">Northstar</Link>
        <nav style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link href="/" className="muted">Browse</Link>
          <span className="muted">{user.displayName}</span>
        </nav>
      </header>

      <section style={{ paddingTop: '40px' }}>
        <h1 style={{ color: 'var(--ink)', fontSize: '32px', marginBottom: '8px' }}>Welcome back, {user.displayName}</h1>
        <p className="muted" style={{ marginBottom: '40px' }}>@{user.username}</p>

        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ color: 'var(--ink)', fontSize: '18px', fontWeight: 700, margin: 0 }}>My videos</h2>
            <Link href="/dashboard/upload" className="button" style={{ fontSize: '13px', minHeight: '36px', padding: '0 14px' }}>Upload video</Link>
          </div>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
            <span className="muted">{myVideos.length} upload{myVideos.length !== 1 ? 's' : ''}</span>
            <span className="muted">{myVideos.filter(v => v.status === 'PUBLISHED').length} published</span>
          </div>
          {myVideos.length === 0 ? (
            <div className="empty">No videos yet. <Link href="/dashboard/upload" style={{ color: 'var(--teal)' }}>Upload your first video</Link></div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {myVideos.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', background: 'white', border: '1px solid var(--line)', borderRadius: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
                    <span className="muted" style={{ fontSize: '12px' }}>{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: STATUS_COLOR[v.status] ?? '#68746e', flexShrink: 0 }}>{STATUS_LABEL[v.status] ?? v.status}</span>
                  {(v.status === 'READY' || v.status === 'PUBLISHED') && (
                    <Link href={`/watch/${v.id}`} style={{ fontSize: '13px', color: 'var(--teal)', fontWeight: 600, flexShrink: 0 }}>Watch</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <h2 style={{ color: 'var(--ink)', fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Continue watching</h2>
            <div className="row">
              {history.slice(0, 6).map(item => (
                <Link key={item.videoId} href={`/watch/${item.videoId}`} className="poster">
                  <div style={{ position: 'relative', aspectRatio: '16/9', background: '#1a2620', borderRadius: '6px', overflow: 'hidden' }}>
                    {item.video.thumbnailKey ? <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? ''}/thumb/${item.video.thumbnailKey}`} alt={item.video.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#2a3830' }} />}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: '#2a3830' }}>
                      <div style={{ height: '100%', width: `${progressPct(item)}%`, background: 'var(--teal)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '8px', display: 'block' }}>{item.video.title}</span>
                  <span className="muted" style={{ fontSize: '12px' }}>{progressPct(item)}% watched</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {watchlist.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <h2 style={{ color: 'var(--ink)', fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>My list</h2>
            <div className="row">
              {watchlist.slice(0, 6).map(item => (
                <Link key={item.video.id} href={`/watch/${item.video.id}`} className="poster">
                  <div style={{ aspectRatio: '16/9', background: '#2a3830', borderRadius: '6px', overflow: 'hidden' }}>
                    {item.video.thumbnailKey ? <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? ''}/thumb/${item.video.thumbnailKey}`} alt={item.video.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%' }} />}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '8px', display: 'block' }}>{item.video.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && watchlist.length === 0 && (
          <div className="empty" style={{ marginTop: '0' }}>
            Nothing watched yet — <Link href="/" style={{ color: 'var(--teal)' }}>browse videos</Link> to get started.
          </div>
        )}
      </section>
    </main>
  );
}
