'use client';
import { useState } from 'react';

export function EmbedCode({ videoId, appUrl, title }: { videoId: string; appUrl: string; title: string }) {
  const base = appUrl.replace(/\/$/, '');
  const embedUrl = `${base}/e/${videoId}`;
  const watchUrl = `${base}/watch/${videoId}`;
  const iframeCode = `<iframe src="${embedUrl}" width="640" height="360" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>`;

  const [copied, setCopied] = useState<'embed' | 'link' | 'url' | null>(null);
  const copy = (text: string, key: 'embed' | 'link' | 'url') => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="adminBar" style={{ marginTop: '24px' }}>
      <span className="eyebrow">Share &amp; Embed</span>
      <div style={{ display: 'grid', gap: '12px', marginTop: '4px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#72a39b', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Watch link</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <code className="hlsCode" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{watchUrl}</code>
            <button onClick={() => copy(watchUrl, 'link')} className="button" style={{ fontSize: '12px', padding: '0 12px', minHeight: '30px', flexShrink: 0 }}>{copied === 'link' ? 'Copied!' : 'Copy'}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#72a39b', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Embed URL</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <code className="hlsCode" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{embedUrl}</code>
            <button onClick={() => copy(embedUrl, 'url')} className="button" style={{ fontSize: '12px', padding: '0 12px', minHeight: '30px', flexShrink: 0 }}>{copied === 'url' ? 'Copied!' : 'Copy'}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#72a39b', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Iframe embed code</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <code className="hlsCode" style={{ flex: 1, wordBreak: 'break-all', fontSize: '12px', lineHeight: '1.5' }}>{iframeCode}</code>
            <button onClick={() => copy(iframeCode, 'embed')} className="button" style={{ fontSize: '12px', padding: '0 12px', minHeight: '30px', flexShrink: 0 }}>{copied === 'embed' ? 'Copied!' : 'Copy'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
