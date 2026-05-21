import { useState, useEffect } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';

function extractPageId(url) {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const uuid = seg.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
      if (uuid) return uuid[1];
      const hex = seg.match(/([a-f0-9]{32})$/i);
      if (hex) {
        const r = hex[1];
        return `${r.slice(0,8)}-${r.slice(8,12)}-${r.slice(12,16)}-${r.slice(16,20)}-${r.slice(20)}`;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function notionCall(body) {
  const res = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function plainText(rich) {
  return (rich || []).map((r) => r.plain_text).join('');
}

// Simple read-only block renderer — title/paragraph/list only
function SimpleBlocks({ blocks }) {
  const items = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'bulleted_list_item') {
      const liItems = [];
      while (i < blocks.length && blocks[i].type === 'bulleted_list_item') {
        liItems.push(blocks[i++]);
      }
      items.push(
        <ul key={`ul-${i}`} className="nb-ul">
          {liItems.map((li) => <li key={li.id}>{plainText(li.bulleted_list_item?.rich_text)}</li>)}
        </ul>
      );
    } else if (b.type === 'numbered_list_item') {
      const liItems = [];
      while (i < blocks.length && blocks[i].type === 'numbered_list_item') {
        liItems.push(blocks[i++]);
      }
      items.push(
        <ol key={`ol-${i}`} className="nb-ol">
          {liItems.map((li) => <li key={li.id}>{plainText(li.numbered_list_item?.rich_text)}</li>)}
        </ol>
      );
    } else {
      const txt = plainText(b[b.type]?.rich_text);
      switch (b.type) {
        case 'heading_1': items.push(<h1 key={b.id} className="nb-h1">{txt}</h1>); break;
        case 'heading_2': items.push(<h2 key={b.id} className="nb-h2">{txt}</h2>); break;
        case 'heading_3': items.push(<h3 key={b.id} className="nb-h3">{txt}</h3>); break;
        case 'paragraph': if (txt) items.push(<p key={b.id} className="nb-p">{txt}</p>); break;
        case 'divider':   items.push(<hr key={b.id} className="nb-hr" />); break;
        case 'quote':     items.push(<blockquote key={b.id} className="nb-quote">{txt}</blockquote>); break;
        case 'to_do':
          items.push(
            <div key={b.id} className="nb-todo">
              <input type="checkbox" checked={!!b.to_do?.checked} readOnly />
              <span style={{ textDecoration: b.to_do?.checked ? 'line-through' : 'none', opacity: b.to_do?.checked ? 0.5 : 1 }}>{txt}</span>
            </div>
          );
          break;
        default: break;
      }
      i++;
    }
  }
  return <>{items}</>;
}

export default function NotionTab({ projectId, project, updateProject }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [activePage, setActivePage] = useState(null);

  const [blocks, setBlocks] = useState([]);
  const [pageTitle, setPageTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenSetup, setShowTokenSetup] = useState(false);

  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = project?.notionToken || '';
    setToken(t);
    setTokenInput(t);
  }, [project?.notionToken]);

  useEffect(() => {
    if (!activePage && pages.length > 0) setActivePage(pages[0]);
  }, [pages, activePage]);

  useEffect(() => {
    if (!activePage || !token) return;
    fetchPage(activePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.id, token]);

  const fetchPage = async (page) => {
    const pageId = extractPageId(page.url);
    if (!pageId) { setError('유효한 Notion URL이 아닙니다.'); return; }

    setLoading(true);
    setError('');
    setBlocks([]);
    setPageTitle('');

    try {
      const meta = await notionCall({ action: 'page', id: pageId, token });
      if (meta.object === 'error') throw new Error(meta.message || '페이지를 불러올 수 없습니다');

      const titleProp = meta.properties?.title || meta.properties?.Name;
      setPageTitle(titleProp?.title?.[0]?.plain_text || page.name);

      const blocksData = await notionCall({ action: 'blocks', id: pageId, token });
      if (blocksData.object === 'error') throw new Error(blocksData.message);
      setBlocks(blocksData.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveToken = async () => {
    if (!tokenInput.trim() || !updateProject) return;
    await updateProject({ notionToken: tokenInput.trim() });
    setShowTokenSetup(false);
  };

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
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={'notion-token-btn' + (token ? ' linked' : '')}
              onClick={() => setShowTokenSetup((v) => !v)}
              title="Integration 토큰 설정"
            >
              {token ? '🔗' : '🔑'}
            </button>
            <button className="notion-add-btn" onClick={() => setShowAdd((v) => !v)} title="페이지 추가">+</button>
          </div>
        </div>

        {showTokenSetup && (
          <div className="notion-token-panel">
            <div className="notion-token-guide">
              <b>Integration 토큰 발급</b><br />
              1. <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">notion.so/my-integrations</a>에서 Integration 생성<br />
              2. 토큰 복사 후 아래에 입력<br />
              3. Notion에서 공유할 페이지에 Integration 추가
            </div>
            <input
              className="notion-token-input"
              placeholder="secret_xxxx…"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              type="password"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn accent sm" onClick={saveToken} disabled={!tokenInput.trim()}>저장</button>
              {token && (
                <button
                  className="btn sm"
                  style={{ color: 'var(--rose)' }}
                  onClick={() => { updateProject?.({ notionToken: null }); setToken(''); setTokenInput(''); setShowTokenSetup(false); }}
                >
                  연결 해제
                </button>
              )}
              <button className="btn sm" onClick={() => setShowTokenSetup(false)}>취소</button>
            </div>
          </div>
        )}

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
              <button className="btn accent sm" onClick={handleAdd} disabled={!addUrl.trim() || adding}>{adding ? '…' : '추가'}</button>
              <button className="btn sm" onClick={() => { setShowAdd(false); setAddUrl(''); setAddName(''); }}>취소</button>
            </div>
          </div>
        )}

        {!token && !showTokenSetup && (
          <div className="notion-no-token">
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
            <div style={{ marginBottom: 10, fontSize: 12 }}>Integration 토큰을 설정해야<br />페이지를 불러올 수 있습니다.</div>
            <button className="btn accent sm" onClick={() => setShowTokenSetup(true)}>토큰 설정</button>
          </div>
        )}

        {pages.length === 0 && !showAdd && token && (
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
              <span className="notion-viewer-title">📄 {pageTitle || activePage.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <a
                  className="btn sm accent"
                  href={activePage.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12 }}
                >
                  Notion에서 열기 ↗
                </a>
                <button className="btn sm" style={{ fontSize: 12 }} onClick={() => fetchPage(activePage)} disabled={loading}>
                  {loading ? '…' : '↺ 새로고침'}
                </button>
              </div>
            </div>

            <div className="notion-content">
              {!token && (
                <div className="notion-content-empty">🔑 Integration 토큰을 설정하세요.</div>
              )}
              {token && loading && (
                <div className="notion-content-empty">
                  <span className="ai-typing"><span /><span /><span /></span>
                  <span style={{ marginLeft: 10, color: 'var(--ink-3)' }}>페이지를 불러오는 중…</span>
                </div>
              )}
              {token && !loading && error && (
                <div className="notion-error">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>불러오기 실패</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>{error}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    • Integration 토큰이 올바른지 확인하세요<br />
                    • 해당 페이지에 Integration이 공유되었는지 확인하세요<br />
                    • Notion 페이지 설정 → 연결 → Integration 이름 추가
                  </div>
                </div>
              )}
              {token && !loading && !error && blocks.length === 0 && (
                <div className="notion-content-empty" style={{ color: 'var(--ink-mute)' }}>페이지가 비어있습니다.</div>
              )}
              {token && !loading && !error && blocks.length > 0 && (
                <div className="nb-body">
                  <SimpleBlocks blocks={blocks} />
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
