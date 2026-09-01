'use client';
import Hls from 'hls.js';
import { Expand, Pause, PictureInPicture2, Play, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Ads = { popAdsScriptUrl?: string; vastTagUrl?: string };
const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export function Player({ source, videoId, startTime, ads }: { source: string; videoId: string; startTime: number; ads: Ads }) {
  const video = useRef<HTMLVideoElement>(null); const container = useRef<HTMLDivElement>(null); const hls = useRef<Hls | null>(null); const saved = useRef(0); const firedView = useRef(false);
  const [playing, setPlaying] = useState(false); const [muted, setMuted] = useState(false); const [position, setPosition] = useState(0); const [duration, setDuration] = useState(0); const [levels, setLevels] = useState<{ id: number; label: string }[]>([]);
  useEffect(() => { if (!ads.popAdsScriptUrl || document.querySelector(`script[src="${ads.popAdsScriptUrl}"]`)) return; const script = document.createElement('script'); script.src = ads.popAdsScriptUrl; script.async = true; document.head.appendChild(script); return () => script.remove(); }, [ads.popAdsScriptUrl]);
  useEffect(() => { const element = video.current; if (!element) return; if (element.canPlayType('application/vnd.apple.mpegurl')) element.src = source; else if (Hls.isSupported()) { const instance = new Hls({ capLevelToPlayerSize: true }); hls.current = instance; instance.loadSource(source); instance.attachMedia(element); instance.on(Hls.Events.MANIFEST_PARSED, (_, data) => setLevels([{ id: -1, label: 'Auto' }, ...data.levels.map((level, id) => ({ id, label: `${level.height}p` }))])); } return () => instanceCleanup(); }, [source]);
  useEffect(() => { const element = video.current; if (!element || !startTime) return; const resume = () => { element.currentTime = startTime; }; element.addEventListener('loadedmetadata', resume, { once: true }); return () => element.removeEventListener('loadedmetadata', resume); }, [startTime]);
  const instanceCleanup = () => { hls.current?.destroy(); hls.current = null; };
  const fireView = () => {
    if (firedView.current) return;
    firedView.current = true;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/videos/${videoId}/view`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    if (ads.vastTagUrl) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/ad-events`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoId, eventType: 'IMPRESSION' }) }).catch(() => undefined);
      setTimeout(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/ad-events`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoId, eventType: 'COMPLETE', adDurationSeconds: 30 }) }).catch(() => undefined);
      }, 5000);
    }
  };
  const play = () => { const element = video.current; if (!element) return; if (element.paused) { fireView(); void element.play(); } else element.pause(); };
  const save = (current: number, total: number) => { if (!Number.isFinite(total) || (current - saved.current < 20 && current < total - 5)) return; saved.current = current; fetch(`${process.env.NEXT_PUBLIC_API_URL}/watch-history`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoId, positionSeconds: Math.floor(current), durationSeconds: Math.floor(total), watchedSeconds: 20 }) }).catch(() => undefined); };
  return <div ref={container} className="customPlayer" data-vast-tag={ads.vastTagUrl}><video ref={video} className="customPlayerVideo" playsInline onClick={play} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onVolumeChange={(event) => setMuted(event.currentTarget.muted)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => { setPosition(event.currentTarget.currentTime); save(event.currentTarget.currentTime, event.currentTarget.duration); }} /><div className="playerShade" /><div className="playerControls"><input className="seek" aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={position} onChange={(event) => { const value = Number(event.target.value); if (video.current) video.current.currentTime = value; setPosition(value); }} /><div className="controlBar"><div className="controlGroup"><button className="iconButton" aria-label={playing ? 'Pause' : 'Play'} onClick={play}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button className="iconButton" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { if (video.current) video.current.muted = !video.current.muted; }}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button><span className="time">{time(position)} / {time(duration)}</span></div><div className="controlGroup"><label className="quality"><Settings2 size={17} /><select aria-label="Quality" defaultValue={-1} onChange={(event) => { if (hls.current) hls.current.currentLevel = Number(event.target.value); }}>{levels.length ? levels.map((level) => <option value={level.id} key={level.id}>{level.label}</option>) : <option>Auto</option>}</select></label><button className="iconButton" aria-label="Picture in picture" onClick={() => { if (video.current) void video.current.requestPictureInPicture(); }}><PictureInPicture2 size={19} /></button><button className="iconButton" aria-label="Fullscreen" onClick={() => { if (container.current) void container.current.requestFullscreen(); }}><Expand size={19} /></button></div></div></div></div>;
}
