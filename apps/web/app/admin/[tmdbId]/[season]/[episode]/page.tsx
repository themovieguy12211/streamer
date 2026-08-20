import { ContentEditor } from '../../../ui/content-editor';
export default async function EpisodeEditor({ params }: { params: Promise<{ tmdbId: string; season: string; episode: string }> }) { const { tmdbId, season, episode } = await params; return <ContentEditor tmdbId={tmdbId} season={season} episode={episode} />; }
