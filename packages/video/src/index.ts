export const renditions = [
  { name: '1080p', height: 1080, bandwidth: 5_000_000 },
] as const;

export function masterPlaylist(videoId: string) {
  const streams = renditions.map((r) => `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${Math.round(r.height * 16 / 9)}x${r.height},CODECS="avc1.64001f,mp4a.40.2"\n${r.name}/playlist.m3u8`).join('\n');
  return `#EXTM3U\n#EXT-X-VERSION:3\n${streams}\n`;
}
