import Link from 'next/link';
import type { Video } from '../page';

const formatViews = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` :
  String(n);

const formatDuration = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function CatalogueRow({ title, videos }: { title: string; videos: Video[] }) {
  return (
    <section className="section">
      <div className="sectionTitle">
        <h2>{title}</h2>
        <span>View all</span>
      </div>
      {videos.length ? (
        <div className="row">
          {videos.map((video) => (
            <Link className="poster" href={`/watch/${video.id}`} key={video.id}>
              <div className="posterImage">
                {video.thumbnailKey ? (
                  <img
                    src={`${process.env.NEXT_PUBLIC_B2_BASE_URL ?? ''}/${video.thumbnailKey}`}
                    alt=""
                  />
                ) : (
                  <div className="posterPlaceholder">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <rect x="2" y="2" width="20" height="20" rx="2" />
                      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5" />
                    </svg>
                  </div>
                )}
                <div className="playOverlay">
                  <div className="playBtn">&#9654;</div>
                </div>
                {video.durationSeconds != null && (
                  <span className="durationBadge">{formatDuration(video.durationSeconds)}</span>
                )}
              </div>
              <div style={{ padding: '10px 12px 14px' }}>
                <span className="posterTitle">{video.title}</span>
                <div className="viewsBadge">{formatViews(video.viewCount ?? 0)} views</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">The catalogue will appear here once videos are published.</div>
      )}
    </section>
  );
}
