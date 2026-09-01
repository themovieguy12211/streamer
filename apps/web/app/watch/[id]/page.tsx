import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Player } from '../../ui/player';
export default async function Watch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const response = await fetch(`${api}/videos/${id}`, { cache: 'no-store', headers: cookieHeader ? { Cookie: cookieHeader } : {} });
  if (!response.ok) notFound();
  const { video, streamUrl, hlsUrl, resumePositionSeconds, ads } = await response.json();
  return (
    <>
      <header className="shell nav"><a className="brand" href="/">Northstar</a><span className="muted">Watch</span></header>
      <main className="shell videoPage">
        <div className="player">{streamUrl ? <Player source={streamUrl} videoId={id} startTime={resumePositionSeconds} ads={ads} /> : <div className="empty">This video is not available for playback yet.</div>}</div>
        <div className="details">
          <div>
            <span className="eyebrow">{video.contentType === 'EPISODE' ? `Episode ${video.episodeNumber}` : video.language} • {video.ageRating ?? 'Unrated'}</span>
            <h1>{video.title}</h1>
            <p>{video.description ?? 'No description has been added.'}</p>
          </div>
          <aside className="meta">
            <span>{video.durationSeconds ? `${Math.round(video.durationSeconds / 60)} minutes` : 'Feature length'}</span>
            <span>{video.releaseDate ? new Date(video.releaseDate).getFullYear() : 'New release'}</span>
            <button className="button">Add to my list</button>
          </aside>
        </div>
        {hlsUrl && (
          <div className="adminBar">
            <span className="eyebrow">Admin — Direct stream URL</span>
            <code className="hlsCode">{hlsUrl}</code>
          </div>
        )}
      </main>
    </>
  );
}
