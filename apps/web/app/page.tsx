import Link from 'next/link';
import { cookies } from 'next/headers';
import { CatalogueRow } from './ui/catalogue-row';
export const dynamic = 'force-dynamic';

export default async function Home() {
  const api = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const fetchHeaders: Record<string, string> = cookieHeader ? { Cookie: cookieHeader } : {};

  let videos: Video[] = [];
  let user: { role: string; displayName: string } | null = null;

  try {
    const [videosRes, meRes] = await Promise.all([
      fetch(`${api}/videos?limit=10`, { cache: 'no-store', headers: fetchHeaders }),
      fetch(`${api}/auth/me`, { cache: 'no-store', headers: fetchHeaders }),
    ]);
    if (videosRes.ok) videos = (await videosRes.json()).data;
    if (meRes.ok) user = (await meRes.json()).user;
  } catch { /* API not yet started */ }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <>
      <header className="nav">
        <Link className="brand" href="/">Northstar</Link>
        <nav className="navlinks">
          <Link href="/">Discover</Link>
          {user && <Link href="/dashboard">My List</Link>}
          {isAdmin && <Link href="/admin">Admin</Link>}
        </nav>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isAdmin && <Link className="button" href="/dashboard/upload">Upload</Link>}
            <Link href="/dashboard" style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600 }}>
              {user.displayName}
            </Link>
          </div>
        ) : (
          <Link className="button" href="/login">Sign in</Link>
        )}
      </header>
      <main>
        <section className="hero">
          <div className="shell">
            <span className="eyebrow">Video Hosting Platform</span>
            <h1>Upload. Share. Earn.</h1>
            <p>Host your videos, reach a global audience, and monetize your content — all in one place.</p>
            <div className="heroButtons">
              {user ? (
                <Link className="button" href="/dashboard/upload">Upload a video</Link>
              ) : (
                <>
                  <Link className="button" href="/register">Get started free</Link>
                  <Link
                    className="button"
                    href={videos[0] ? `/watch/${videos[0].id}` : '#catalogue'}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    Browse videos
                  </Link>
                </>
              )}
            </div>
            <div className="heroStats">
              <div>Join <span>thousands</span> of uploaders</div>
              {videos.length > 0 && <div><span>{videos.length}+</span> videos hosted</div>}
            </div>
          </div>
        </section>
        <div id="catalogue" className="shell content">
          <CatalogueRow title="Recently Added" videos={videos} />
          <CatalogueRow title="Popular This Week" videos={videos.slice().reverse()} />
          <CatalogueRow title="Explore" videos={videos} />
        </div>
      </main>
    </>
  );
}

export type Video = {
  id: string;
  title: string;
  description: string | null;
  thumbnailKey: string | null;
  durationSeconds: number | null;
  releaseDate: string | null;
  viewCount: number | null;
};
