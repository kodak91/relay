import { useState, useEffect } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';

// iframe embed code 또는 일반 URL에서 src 추출
function parseEmbedInput(input) {
  const trimmed = input.trim();
  const srcMatch = trimmed.match(/src=["']([^"']+)["']/);
  if (srcMatch) return srcMatch[1];
  return trimmed;
}

export default function NotionTab({ projectId }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [activePage, setActivePage] = useState(null);
  const [addInput, setAddInput] = useState('');
  const [addName, setAddName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!activePage && pages.length > 0) setActivePage(pages[0]);
  }, [pages, activePage]);

  const handleAdd = async () => {
    const embedUrl = parseEmbedInput(addInput);
    if (!embedUrl || adding) return;
    setAdding(true);
    await addPage(embedUrl, addName);
    setAddInput(''); setAddName(''); setShowAdd(false);
    setAdding(false);
  };

  const handleDelete = async (e, page) => {
    e.stopPropagation();
    await deletePage(page.id);
    if (activePage?.id === page.id) setActivePage(null);
  };

  // 임베드 URL에서 원본 Notion 페이지 URL 추정 (ebd// 경로 제거)
  const getNotionUrl = (url) => url?.replace(/\/ebd\/\//, '/') || url;

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
            <textarea
              autoFocus
              rows={3}
              placeholder={'임베드 코드 또는 URL 붙여넣기\n\n예) <iframe src="https://..." />'}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              style={{ resize: 'none', fontSize: 12, fontFamily: 'var(--font-mono)' }}
            />
            <input
              placeholder="표시 이름 (선택)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.6 }}>
              Notion 페이지 → 공유 → 웹에 게시 → <b>임베드 코드 복사</b> 후 붙여넣기
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn accent sm" onClick={handleAdd} disabled={!addInput.trim() || adding}>
                {adding ? '…' : '추가'}
              </button>
              <button className="btn sm" onClick={() => { setShowAdd(false); setAddInput(''); setAddName(''); }}>취소</button>
            </div>
          </div>
        )}

        {pages.length === 0 && !showAdd && (
          <div className="notion-empty-list">
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7 }}>
              Notion 페이지 → 공유<br />
              → 웹에 게시 → <b>임베드 코드</b><br />
              를 복사해서 추가하세요
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
                href={getNotionUrl(activePage.url)}
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
              allowFullScreen
            />
          </>
        )}
      </section>
    </div>
  );
}
