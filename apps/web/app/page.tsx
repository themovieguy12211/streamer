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
      <header className="shell nav">
        <Link className="brand" href="/">Northstar</Link>
        <nav className="navlinks">
          <Link href="/">Discover</Link>
          {user && <Link href="/dashboard">My List</Link>}
          {isAdmin && <Link href="/admin">Admin</Link>}
        </nav>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isAdmin && <Link className="button" href="/dashboard/upload">Upload</Link>}
            <Link href="/dashboard" style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>{user.displayName}</Link>
          </div>
        ) : (
          <Link className="button" href="/login">Sign in</Link>
        )}
      </header>
      <main>
        <section className="hero">
          <div className="shell">
            <span className="eyebrow">Featured</span>
            <h1>Long stories, given room to breathe.</h1>
            <p>Watch thoughtful films, performances, and true stories without a rush.</p>
            <Link className="button" href={videos[0] ? `/watch/${videos[0].id}` : '#catalogue'}>Watch now</Link>
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

export type Video = { id: string; title: string; description: string | null; thumbnailKey: string | null; durationSeconds: number | null; releaseDate: string | null };
