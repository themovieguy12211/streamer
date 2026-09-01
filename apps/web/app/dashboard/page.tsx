'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type User = { id: string; displayName: string; username: string; email: string; role: string };
type Video = { id: string; title: string; thumbnailKey: string | null; durationSeconds: number | null };
type HistoryItem = { videoId: string; positionSeconds: number; durationSeconds: number; lastWatchedAt: string; video: Video };
type WatchlistItem = { video: Video };
type MyVideo = { id: string; title: string; status: string; visibility: string; createdAt: string; encodingProgress: number | null };
type Earnings = { totalViews: number; revenueUsd: string; balanceUsd: string; cpmRate: number; revenueShare: number };

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', UPLOADING: 'Uploading', QUEUED: 'Queued', PROCESSING: 'Encoding', READY: 'Ready', PUBLISHED: 'Published', FAILED: 'Failed' };
const STATUS_COLOR: Record<string, string> = { DRAFT: '#9898b8', UPLOADING: '#ffaa00', QUEUED: '#ffaa00', PROCESSING: '#ffaa00', READY: '#00bfff', PUBLISHED: '#22d27a', FAILED: '#ff4560' };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [myVideos, setMyVideos] = useState<MyVideo[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/auth/me', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/v1/watch-history', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/v1/watchlist', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/v1/my-videos', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/v1/earnings', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([me, hist, wl, mv, earn]) => {
      if (!me.user) { window.location.href = '/login'; return; }
      setUser(me.user);
      setHistory(hist.data ?? []);
      setWatchlist(wl.data ?? []);
      setMyVideos(mv.data ?? []);
      setEarnings(earn);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      Loading...
    </div>
  );
  if (!user) return null;

  const progressPct = (item: HistoryItem) => item.durationSeconds ? Math.round((item.positionSeconds / item.durationSeconds) * 100) : 0;

  const submitWithdraw = (event: React.FormEvent) => {
    event.preventDefault();
    fetch('/api/v1/withdrawals', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountUsd: parseFloat(withdrawAmount), method: withdrawMethod, address: withdrawAddress }) })
      .then(r => { if (r.ok) { setWithdrawSuccess(true); setShowWithdraw(false); setWithdrawAmount(''); setWithdrawMethod(''); setWithdrawAddress(''); } })
      .catch(() => undefined);
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      {/* Top nav */}
      <header className="adminHeader">
        <Link className="brand" href="/">Northstar</Link>
        <nav style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--text2)', fontSize: '14px' }}>Browse</Link>
          <span style={{ color: 'var(--text2)', fontSize: '14px' }}>{user.displayName}</span>
        </nav>
      </header>

      <div className="dashLayout">
        {/* Sidebar */}
        <aside className="sidebar">
          <Link href="/dashboard" className="sidebarLink active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </Link>
          <Link href="/dashboard" className="sidebarLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.899L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            My Videos
          </Link>
          <Link href="/dashboard/upload" className="sidebarLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Upload
          </Link>
          <Link href="/dashboard" className="sidebarLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            Earnings
          </Link>
          <Link href="#account" className="sidebarLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Account
          </Link>
        </aside>

        {/* Main content */}
        <div className="dashContent">
          {/* Welcome + stats row */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ color: 'var(--text)', fontSize: '26px', fontWeight: 700, margin: '0 0 4px' }}>
              Welcome back, {user.displayName}
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: '14px', margin: 0 }}>@{user.username}</p>
          </div>

          {earnings && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '40px', flexWrap: 'wrap' }}>
              <div className="statCard" style={{ flex: 1, minWidth: '140px' }}>
                <div className="statCardValue">{earnings.totalViews.toLocaleString()}</div>
                <div className="statCardLabel">Total views</div>
              </div>
              <div className="statCard" style={{ flex: 1, minWidth: '140px' }}>
                <div className="statCardValue" style={{ color: 'var(--success)' }}>${earnings.revenueUsd}</div>
                <div className="statCardLabel">Total earned</div>
              </div>
              <div className="statCard" style={{ flex: 1, minWidth: '140px' }}>
                <div className="statCardValue" style={{ color: 'var(--accent2)' }}>${earnings.balanceUsd}</div>
                <div className="statCardLabel">Available balance</div>
              </div>
              <div className="statCard" style={{ flex: 1, minWidth: '140px' }}>
                <div className="statCardValue">{myVideos.length}</div>
                <div className="statCardLabel">Total videos</div>
              </div>
            </div>
          )}

          {/* Earnings section */}
          {earnings && (
            <div style={{ marginBottom: '48px' }}>
              <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, marginBottom: '16px' }}>Earnings</h2>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '16px' }}>
                CPM ${earnings.cpmRate.toFixed(2)} &middot; Revenue share {Math.round(earnings.revenueShare * 100)}%
              </div>
              {withdrawSuccess && (
                <div style={{ color: 'var(--success)', marginBottom: '12px', fontSize: '14px' }}>
                  Withdrawal request submitted successfully.
                </div>
              )}
              {!showWithdraw ? (
                <button className="button" style={{ fontSize: '13px', minHeight: '36px', padding: '0 14px' }} onClick={() => setShowWithdraw(true)}>
                  Withdraw
                </button>
              ) : (
                <form onSubmit={submitWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '360px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    Amount (USD, min $5)
                    <input type="number" min="5" step="0.01" required value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="10.00"
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px', background: 'var(--surface2)', color: 'var(--text)' }} />
                  </label>
                  <label style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    Method (e.g. Bitcoin, PayPal)
                    <input type="text" required value={withdrawMethod} onChange={e => setWithdrawMethod(e.target.value)} placeholder="Bitcoin"
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px', background: 'var(--surface2)', color: 'var(--text)' }} />
                  </label>
                  <label style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    Address / Email
                    <input type="text" required value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)} placeholder="your address or email"
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '14px', background: 'var(--surface2)', color: 'var(--text)' }} />
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className="button" style={{ fontSize: '13px', minHeight: '36px', padding: '0 14px' }}>Submit</button>
                    <button type="button" onClick={() => setShowWithdraw(false)}
                      style={{ fontSize: '13px', padding: '0 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text)' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* My Videos */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, margin: 0 }}>My videos</h2>
              <Link href="/dashboard/upload" className="button" style={{ fontSize: '13px', minHeight: '36px', padding: '0 14px' }}>
                Upload video
              </Link>
            </div>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
              <span style={{ color: 'var(--text2)', fontSize: '13px' }}>{myVideos.length} upload{myVideos.length !== 1 ? 's' : ''}</span>
              <span style={{ color: 'var(--text2)', fontSize: '13px' }}>{myVideos.filter(v => v.status === 'PUBLISHED').length} published</span>
            </div>
            {myVideos.length === 0 ? (
              <div className="empty">
                No videos yet. <Link href="/dashboard/upload" style={{ color: 'var(--accent)' }}>Upload your first video</Link>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {myVideos.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: STATUS_COLOR[v.status] ?? 'var(--text2)', flexShrink: 0 }}>
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                    {(v.status === 'READY' || v.status === 'PUBLISHED') && (
                      <Link href={`/watch/${v.id}`} style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>Watch</Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Continue watching */}
          {history.length > 0 && (
            <div style={{ marginBottom: '48px' }}>
              <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, marginBottom: '20px' }}>Continue watching</h2>
              <div className="row">
                {history.slice(0, 6).map(item => (
                  <Link key={item.videoId} href={`/watch/${item.videoId}`} className="poster">
                    <div className="posterImage">
                      {item.video.thumbnailKey
                        ? <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? ''}/thumb/${item.video.thumbnailKey}`} alt={item.video.title} />
                        : <div style={{ width: '100%', height: '100%', background: 'var(--surface3)' }} />
                      }
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'var(--surface3)' }}>
                        <div style={{ height: '100%', width: `${progressPct(item)}%`, background: 'var(--accent)' }} />
                      </div>
                    </div>
                    <div style={{ padding: '10px 12px 14px' }}>
                      <span className="posterTitle">{item.video.title}</span>
                      <div className="viewsBadge">{progressPct(item)}% watched</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* My list / watchlist */}
          {watchlist.length > 0 && (
            <div style={{ marginBottom: '48px' }}>
              <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, marginBottom: '20px' }}>My list</h2>
              <div className="row">
                {watchlist.slice(0, 6).map(item => (
                  <Link key={item.video.id} href={`/watch/${item.video.id}`} className="poster">
                    <div className="posterImage">
                      {item.video.thumbnailKey
                        ? <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? ''}/thumb/${item.video.thumbnailKey}`} alt={item.video.title} />
                        : <div style={{ width: '100%', height: '100%', background: 'var(--surface3)' }} />
                      }
                    </div>
                    <div style={{ padding: '10px 12px 14px' }}>
                      <span className="posterTitle">{item.video.title}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {history.length === 0 && watchlist.length === 0 && !earnings && (
            <div className="empty">
              Nothing watched yet &mdash; <Link href="/" style={{ color: 'var(--accent)' }}>browse videos</Link> to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
