import { ContentEditor } from '../ui/content-editor';
export default async function MovieEditor({ params }: { params: Promise<{ tmdbId: string }> }) { const { tmdbId } = await params; return <ContentEditor tmdbId={tmdbId} />; }
