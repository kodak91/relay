import { useState, useMemo } from 'react';
import { useMessages } from '../../hooks/useMessages';
import useAppStore from '../../store/appStore';

const URL_REGEX = /https?:\/\/[^\s<>")\]]+/g;
const KB_REGEX = /relay-kb:\/\/[^\s)<>"]+/g;

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 30); }
}

function extractLinks(text) {
  if (!text) return [];
  const kbMatches = (text.match(KB_REGEX) || []).map((u) => ({ href: u, isKb: true }));
  const webMatches = (text.match(URL_REGEX) || [])
    .filter((u) => !u.startsWith('relay-kb://'))
    .map((u) => ({ href: u, isKb: false }));
  return [...kbMatches, ...webMatches];
}

const FILTER_TABS = [
  { id: 'all', label: '전체' },
  { id: 'image', label: '이미지' },
  { id: 'file', label: '파일' },
  { id: 'link', label: '링크' },
];

export default function KBMediaTab({ projectId }) {
  const { messages } = useMessages(projectId);
  const { setKbDeepLink, setChatTab } = useAppStore();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const mediaItems = useMemo(() => {
    const items = [];
    for (const m of messages) {
      if (m.type === 'image') {
        items.push({ kind: 'image', url: m.fileUrl, name: m.fileName || '이미지', sender: m.senderName, ts: m.ts, id: m.id + '_img' });
      } else if (m.type === 'file') {
        items.push({ kind: 'file', url: m.fileUrl, name: m.fileName || '파일', size: m.fileSize, fileType: m.fileType, sender: m.senderName, ts: m.ts, id: m.id + '_file' });
      } else if (m.type === 'text' || m.type === 'casual' || m.type === 'update' || m.type === 'announce') {
        const links = extractLinks(m.text || '');
        for (const lk of links) {
          items.push({ kind: lk.isKb ? 'kbpath' : 'link', href: lk.href, sender: m.senderName, ts: m.ts, id: m.id + '_' + lk.href.slice(-8) });
        }
      }
    }
    return items.reverse();
  }, [messages]);

  const filtered = useMemo(() => {
    let list = mediaItems;
    if (filter === 'image') list = list.filter((i) => i.kind === 'image');
    else if (filter === 'file') list = list.filter((i) => i.kind === 'file');
    else if (filter === 'link') list = list.filter((i) => i.kind === 'link' || i.kind === 'kbpath');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => (i.name || i.href || '').toLowerCase().includes(q));
    }
    return list;
  }, [mediaItems, filter, search]);

  const images = filtered.filter((i) => i.kind === 'image');
  const files = filtered.filter((i) => i.kind === 'file');
  const links = filtered.filter((i) => i.kind === 'link' || i.kind === 'kbpath');

  const handleKBPath = (href) => {
    const parts = href.replace('relay-kb://', '').split('/');
    const [, folderId, fileId] = parts;
    setChatTab('kb');
    setKbDeepLink({ folderId: folderId || null, fileId: fileId || null });
  };

  if (messages.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-3)', fontSize: 13 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div>아직 채팅에 올라온 자료가 없어요</div>
        </div>
      </div>
    );
  }

  return (
    <div className="kb-media-root">
      <div className="kb-media-toolbar">
        <div className="kb-media-filters">
          {FILTER_TABS.map((t) => (
            <button key={t.id} className={'kb-media-ft' + (filter === t.id ? ' on' : '')} onClick={() => setFilter(t.id)}>
              {t.label}
              <span className="mono" style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>
                {t.id === 'all' ? mediaItems.length
                  : t.id === 'image' ? mediaItems.filter((i) => i.kind === 'image').length
                  : t.id === 'file' ? mediaItems.filter((i) => i.kind === 'file').length
                  : mediaItems.filter((i) => i.kind === 'link' || i.kind === 'kbpath').length}
              </span>
            </button>
          ))}
        </div>
        <input
          className="kb-media-search"
          placeholder="검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="kb-media-body">
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-mute)', fontSize: 13 }}>
            해당 자료가 없습니다
          </div>
        )}

        {/* Images grid */}
        {images.length > 0 && (filter === 'all' || filter === 'image') && (
          <div className="kb-media-section">
            {filter === 'all' && <div className="kb-media-sh">🖼 이미지</div>}
            <div className="kb-media-img-grid">
              {images.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="kb-media-img-card">
                  <img src={item.url} alt={item.name} />
                  <div className="kb-media-img-meta">{item.sender} · {item.ts}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Files list */}
        {files.length > 0 && (filter === 'all' || filter === 'file') && (
          <div className="kb-media-section">
            {filter === 'all' && <div className="kb-media-sh">📎 파일</div>}
            <div className="kb-media-file-list">
              {files.map((item) => {
                const ext = item.name.split('.').pop().toUpperCase();
                return (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="kb-media-file-row">
                    <div className="kb-media-file-ext">{ext}</div>
                    <div className="kb-media-file-info">
                      <div className="kb-media-file-name">{item.name}</div>
                      <div className="kb-media-file-meta">{item.size} · {item.sender} · {item.ts}</div>
                    </div>
                    <span className="kb-media-file-dl">↗</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Links list */}
        {links.length > 0 && (filter === 'all' || filter === 'link') && (
          <div className="kb-media-section">
            {filter === 'all' && <div className="kb-media-sh">🔗 링크 · 경로</div>}
            <div className="kb-media-link-list">
              {links.map((item) => {
                if (item.kind === 'kbpath') {
                  const parts = item.href.replace('relay-kb://', '').split('/');
                  const label = parts.slice(1).join('/') || item.href;
                  return (
                    <div key={item.id} className="kb-media-link-row kb-path-row">
                      <div className="kb-media-link-favicon">📁</div>
                      <div className="kb-media-link-body">
                        <div className="kb-media-link-title">KB 경로</div>
                        <div className="kb-media-link-url">{label}</div>
                        <div className="kb-media-link-meta">{item.sender} · {item.ts}</div>
                      </div>
                      <button className="kb-media-open-btn" onClick={() => handleKBPath(item.href)}>
                        폴더 열기 →
                      </button>
                    </div>
                  );
                }
                const domain = extractDomain(item.href);
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                return (
                  <a key={item.id} href={item.href} target="_blank" rel="noreferrer noopener" className="kb-media-link-row">
                    <img src={faviconUrl} alt="" className="kb-media-link-favicon" onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="kb-media-link-body">
                      <div className="kb-media-link-domain">{domain}</div>
                      <div className="kb-media-link-url">{item.href.length > 60 ? item.href.slice(0, 58) + '…' : item.href}</div>
                      <div className="kb-media-link-meta">{item.sender} · {item.ts}</div>
                    </div>
                    <span className="kb-media-link-arr">↗</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
