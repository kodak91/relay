import { useState, useEffect } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';

// Extract 32-char hex page ID and return embed URL
function getNotionEmbedUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('notion.so') && !u.hostname.includes('notion.site')) {
      return url; // treat non-Notion URLs as-is (e.g. Notion.site)
    }
    const segments = u.pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      // UUID with dashes: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidMatch = seg.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
      if (uuidMatch) return `https://www.notion.so/embed/${uuidMatch[1]}`;
      // 32-char hex at end (Notion's compact ID style)
      const hexMatch = seg.match(/([a-f0-9]{32})$/i);
      if (hexMatch) {
        const r = hexMatch[1];
        const id = `${r.slice(0,8)}-${r.slice(8,12)}-${r.slice(12,16)}-${r.slice(16,20)}-${r.slice(20)}`;
        return `https://www.notion.so/embed/${id}`;
      }
    }
    // Fallback: try embed with original path
    return url.replace('notion.so/', 'notion.so/embed/');
  } catch { return url; }
}

export default function NotionTab({ projectId }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [activePage, setActivePage] = useState(null);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [loadKey, setLoadKey] = useState(0); // force iframe reload

  // Auto-select first page
  useEffect(() => {
    if (!activePage && pages.length > 0) setActivePage(pages[0]);
  }, [pages, activePage]);

  const handleAdd = async () => {
    if (!addUrl.trim() || adding) return;
    setAdding(true);
    await addPage(addUrl, addName);
    setAddUrl('');
    setAddName('');
    setShowAdd(false);
    setAdding(false);
  };

  const handleDelete = async (e, page) => {
    e.stopPropagation();
    await deletePage(page.id);
    if (activePage?.id === page.id) setActivePage(null);
  };

  const embedUrl = activePage ? getNotionEmbedUrl(activePage.url) : null;

  return (
    <div className="notion-main">
      {/* Left sidebar */}
      <aside className="notion-sidebar">
        <div className="notion-sidebar-hd">
          <span>Notion 페이지</span>
          <button
            className="notion-add-btn"
            onClick={() => setShowAdd((v) => !v)}
            title="페이지 추가"
          >+</button>
        </div>

        {showAdd && (
          <div className="notion-add-form">
            <input
              autoFocus
              placeholder="Notion 페이지 URL"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <input
              placeholder="표시 이름 (선택)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn accent sm" onClick={handleAdd} disabled={!addUrl.trim() || adding}>
                {adding ? '…' : '추가'}
              </button>
              <button className="btn sm" onClick={() => { setShowAdd(false); setAddUrl(''); setAddName(''); }}>취소</button>
            </div>
          </div>
        )}

        {pages.length === 0 && !showAdd && (
          <div className="notion-empty-list">
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div style={{ marginBottom: 12 }}>Notion 페이지 URL을 추가하세요</div>
            <button className="btn accent sm" onClick={() => setShowAdd(true)}>+ 페이지 추가</button>
          </div>
        )}

        {pages.map((p) => (
          <button
            key={p.id}
            className={'notion-page-row' + (activePage?.id === p.id ? ' on' : '')}
            onClick={() => { setActivePage(p); setLoadKey((k) => k + 1); }}
          >
            <span className="notion-page-ico">📄</span>
            <span className="notion-page-name">{p.name}</span>
            <span className="notion-del-btn" onClick={(e) => handleDelete(e, p)} role="button" tabIndex={-1}>×</span>
          </button>
        ))}
      </aside>

      {/* Viewer */}
      <section className="notion-viewer">
        {!activePage ? (
          <div className="notion-viewer-empty">
            <div style={{ fontSize: 52, marginBottom: 16 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>페이지를 선택하세요</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              좌측에서 페이지를 선택하거나 + 버튼으로 추가하세요.
            </div>
          </div>
        ) : (
          <>
            <div className="notion-viewer-toolbar">
              <span className="notion-viewer-title">📄 {activePage.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn sm"
                  style={{ fontSize: 12 }}
                  onClick={() => setLoadKey((k) => k + 1)}
                  title="새로고침"
                >↺</button>
                <a
                  className="btn sm"
                  href={activePage.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12 }}
                >Notion에서 열기 ↗</a>
              </div>
            </div>
            <iframe
              key={loadKey}
              src={embedUrl}
              className="notion-iframe"
              title={activePage.name}
              allow="clipboard-read; clipboard-write"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            />
          </>
        )}
      </section>
    </div>
  );
}
