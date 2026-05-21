import { useState, useEffect } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';

export default function NotionTab({ projectId }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [activePage, setActivePage] = useState(null);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!activePage && pages.length > 0) setActivePage(pages[0]);
  }, [pages, activePage]);

  const handleAdd = async () => {
    if (!addUrl.trim() || adding) return;
    setAdding(true);
    await addPage(addUrl, addName);
    setAddUrl(''); setAddName(''); setShowAdd(false);
    setAdding(false);
  };

  const handleDelete = async (e, page) => {
    e.stopPropagation();
    await deletePage(page.id);
    if (activePage?.id === page.id) setActivePage(null);
  };

  return (
    <div className="notion-main">
      {/* ── Sidebar ── */}
      <aside className="notion-sidebar">
        <div className="notion-sidebar-hd">
          <span>Notion 페이지</span>
          <button className="notion-add-btn" onClick={() => setShowAdd((v) => !v)} title="페이지 추가">+</button>
        </div>

        {showAdd && (
          <div className="notion-add-form">
            <input
              autoFocus
              placeholder="Notion 공개 URL (웹에 게시하기)"
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
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
              Notion 페이지 → 공유 → 웹에 게시하기 → 생성된 링크 붙여넣기
            </div>
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
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
              Notion에서 페이지를<br />
              <b>공유 → 웹에 게시하기</b>로<br />
              공개 URL을 생성 후 추가하세요
            </div>
            <button className="btn accent sm" onClick={() => setShowAdd(true)}>+ 페이지 추가</button>
          </div>
        )}

        {pages.map((p) => (
          <button
            key={p.id}
            className={'notion-page-row' + (activePage?.id === p.id ? ' on' : '')}
            onClick={() => setActivePage(p)}
          >
            <span className="notion-page-ico">📄</span>
            <span className="notion-page-name">{p.name}</span>
            <span className="notion-del-btn" onClick={(e) => handleDelete(e, p)} role="button" tabIndex={-1}>×</span>
          </button>
        ))}
      </aside>

      {/* ── Viewer ── */}
      <section className="notion-viewer">
        {!activePage ? (
          <div className="notion-viewer-empty">
            <div style={{ fontSize: 52, marginBottom: 16 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>페이지를 선택하세요</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>좌측에서 페이지를 선택하거나 + 버튼으로 추가하세요.</div>
          </div>
        ) : (
          <>
            <div className="notion-viewer-toolbar">
              <span className="notion-viewer-title">📄 {activePage.name}</span>
              <a
                className="btn sm accent"
                href={activePage.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12 }}
              >
                Notion에서 열기 ↗
              </a>
            </div>
            <iframe
              key={activePage.id}
              src={activePage.url}
              className="notion-iframe"
              title={activePage.name}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </>
        )}
      </section>
    </div>
  );
}
