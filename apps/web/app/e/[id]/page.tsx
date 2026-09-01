import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Player } from '../../ui/player';

export default async function Embed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const response = await fetch(`${api}/videos/${id}`, { cache: 'no-store', headers: cookieHeader ? { Cookie: cookieHeader } : {} });
  if (!response.ok) notFound();
  const { video, streamUrl, ads } = await response.json();
  if (!streamUrl) notFound();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{video.title}</title>
        <style>{`*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}.embedWrap{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}.customPlayer{width:100%;height:100%;position:relative;background:#000;overflow:hidden}.customPlayerVideo{width:100%;height:100%;object-fit:contain}.playerShade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.7) 0%,transparent 30%);pointer-events:none}.playerControls{position:absolute;bottom:0;left:0;right:0;padding:0 12px 10px;opacity:0;transition:opacity .2s}.customPlayer:hover .playerControls{opacity:1}.seek{width:100%;accent-color:#72a39b;cursor:pointer;margin-bottom:8px;height:4px}.controlBar{display:flex;align-items:center;justify-content:space-between}.controlGroup{display:flex;align-items:center;gap:8px}.iconButton{background:none;border:none;color:#fff;cursor:pointer;padding:4px;display:flex;align-items:center;opacity:.9}.iconButton:hover{opacity:1}.time{color:#fff;font-size:13px;font-family:monospace}.quality{display:flex;align-items:center;gap:4px;color:#fff;font-size:13px;cursor:pointer}.quality select{background:transparent;border:none;color:#fff;font-size:13px;cursor:pointer;outline:none}.watermark{position:absolute;top:10px;right:12px;font-size:11px;color:rgba(255,255,255,.4);font-family:sans-serif;pointer-events:none;letter-spacing:.5px}`}</style>
      </head>
      <body>
        <div className="embedWrap">
          <Player source={streamUrl} videoId={id} startTime={0} ads={ads} />
          <div className="watermark">Northstar</div>
        </div>
      </body>
    </html>
  );
}
