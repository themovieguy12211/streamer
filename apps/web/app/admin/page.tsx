'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Stats = { published: number; processing: number; failed: number; total: number };
type Video = { id: string; title: string; status: string; contentType: string; createdAt: string; encodingProgress: number | null; encodingStage: string | null };
type WithdrawalRequest = { id: string; userId: string; amountMicros: number; method: string; address: string; status: string; createdAt: string; note: string | null; user: { username: string; email: string; displayName: string } | null };

const PAYOUT_STATUS_COLOR: Record<string, string> = { PENDING: '#ffaa00', APPROVED: '#00bfff', PAID: '#22d27a', REJECTED: '#ff4560' };
const STATUS_COLOUR: Record<string, string> = { PUBLISHED: '#22d27a', READY: '#00bfff', DRAFT: '#9898b8', QUEUED: '#ffaa00', PROCESSING: '#ffaa00', UPLOADING: '#ffaa00', FAILED: '#ff4560' };

export default function AdminHome() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [tmdbId, setTmdbId] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/admin/stats', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/v1/admin/videos?limit=50', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
      fetch('/api/v1/admin/withdrawals', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: [] }),
    ]).then(([s, v, wd]) => {
      if (s) setStats(s);
      setVideos(v.data ?? []);
      setWithdrawals(wd.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const open = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d+$/.test(tmdbId)) return;
    router.push(season && episode ? `/admin/${tmdbId}/${season}/${episode}` : `/admin/${tmdbId}`);
  };

  const updateWithdrawal = (id: string, status: 'APPROVED' | 'REJECTED' | 'PAID') => {
    fetch(`/api/v1/admin/withdrawals/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) })
      .then(r => { if (r.ok) setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status } : w)); })
      .catch(() => undefined);
  };

  return (
    <main className="adminShell">
      <header className="adminHeader" style={{ margin: '0 -28px', padding: '0 28px' }}>
        <Link className="brand" href="/">Northstar</Link>
        <nav style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--text2)', fontSize: '14px' }}>View site</Link>
          <Link href="/admin/login" style={{ color: 'var(--text2)', fontSize: '14px' }}>Account</Link>
        </nav>
      </header>

      {stats && (
        <div style={{ display: 'flex', gap: '16px', paddingTop: '32px', marginBottom: '32px' }}>
          {[
            { label: 'Published', value: stats.published, color: '#22d27a' },
            { label: 'Processing', value: stats.processing, color: '#ffaa00' },
            { label: 'Failed', value: stats.failed, color: '#ff4560' },
            { label: 'Total', value: stats.total, color: 'var(--text)' },
          ].map(s => (
            <div key={s.label} className="statCard" style={{ flex: 1 }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start' }}>
        <section>
          <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, marginBottom: '16px' }}>Content library</h2>
          {loading ? <div className="empty">Loading...</div> : videos.length === 0 ? (
            <div className="empty">No content yet &mdash; add a title using the form.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Title', 'Type', 'Status', 'Added'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text2)', fontWeight: 600, fontSize: '12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {videos.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 500 }}>{v.title}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{v.contentType}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: (STATUS_COLOUR[v.status] ?? '#9898b8') + '22', color: STATUS_COLOUR[v.status] ?? '#9898b8', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 600 }}>
                        {v.status}{v.status === 'PROCESSING' && v.encodingProgress ? ` ${v.encodingProgress}%` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{new Date(v.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, marginBottom: '16px' }}>Add content</h2>
          <form className="authForm" onSubmit={open}>
            <label>
              TMDb ID
              <input required inputMode="numeric" value={tmdbId} onChange={e => setTmdbId(e.target.value)} placeholder="Movie or series ID" />
            </label>
            <label>
              Season <span style={{ color: 'var(--text2)', fontWeight: 400 }}>optional</span>
              <input inputMode="numeric" value={season} onChange={e => setSeason(e.target.value)} placeholder="1" />
            </label>
            <label>
              Episode <span style={{ color: 'var(--text2)', fontWeight: 400 }}>optional</span>
              <input inputMode="numeric" value={episode} onChange={e => setEpisode(e.target.value)} placeholder="1" />
            </label>
            <button className="button">Open editor</button>
          </form>
        </section>
      </div>

      {withdrawals.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, marginBottom: '16px' }}>Payouts</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['User', 'Amount', 'Method', 'Address', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text2)', fontWeight: 600, fontSize: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withdrawals.map(w => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)' }}>
                    {w.user ? (w.user.displayName || w.user.username) : w.userId}
                    <br />
                    <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{w.user?.email}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>${(w.amountMicros / 1_000_000).toFixed(2)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{w.method}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text2)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.address}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: (PAYOUT_STATUS_COLOR[w.status] ?? '#9898b8') + '22', color: PAYOUT_STATUS_COLOR[w.status] ?? '#9898b8', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 600 }}>
                      {w.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {w.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => updateWithdrawal(w.id, 'APPROVED')}
                          style={{ fontSize: '12px', padding: '2px 8px', background: '#00bfff22', color: '#00bfff', border: '1px solid #00bfff', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                          Approve
                        </button>
                        <button onClick={() => updateWithdrawal(w.id, 'REJECTED')}
                          style={{ fontSize: '12px', padding: '2px 8px', background: '#ff456022', color: '#ff4560', border: '1px solid #ff4560', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                          Reject
                        </button>
                      </div>
                    )}
                    {w.status === 'APPROVED' && (
                      <button onClick={() => updateWithdrawal(w.id, 'PAID')}
                        style={{ fontSize: '12px', padding: '2px 8px', background: '#22d27a22', color: '#22d27a', border: '1px solid #22d27a', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
