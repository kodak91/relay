import { useState, useEffect, createContext, useContext } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';

// ─── Notion page-ID extractor ────────────────────────────────────────────────
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

// ─── Notion API helpers ───────────────────────────────────────────────────────
async function notionFetch(action, id, token) {
  const res = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id, token }),
  });
  const data = await res.json();
  if (data.object === 'error') throw new Error(data.message || '불러오기 실패');
  return data;
}

// Raw fetch (returns data without throwing — for auto-detection)
async function notionFetchRaw(action, id, token) {
  const res = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id, token }),
  });
  return res.json();
}

// ─── Context for token (avoids prop drilling into block renderers) ────────────
const TokenCtx = createContext('');

// ─── Rich text renderer ───────────────────────────────────────────────────────
function RichText({ items }) {
  if (!items?.length) return null;
  return items.map((rt, i) => {
    const text = rt.plain_text;
    if (!text) return null;
    const { bold, italic, code, strikethrough, underline } = rt.annotations || {};
    if (code) return <code key={i} className="nb-code">{text}</code>;
    let el = <>{text}</>;
    if (bold) el = <strong>{el}</strong>;
    if (italic) el = <em>{el}</em>;
    if (strikethrough) el = <s>{el}</s>;
    if (underline) el = <span style={{ textDecoration: 'underline' }}>{el}</span>;
    if (rt.href) return <a key={i} href={rt.href} target="_blank" rel="noreferrer">{el}</a>;
    return <span key={i}>{el}</span>;
  });
}

// ─── Database: select color map ──────────────────────────────────────────────
const SELECT_COLORS = {
  default: 'oklch(0.92 0.005 80)',
  gray:    'oklch(0.88 0.005 80)',
  brown:   'oklch(0.85 0.06 50)',
  orange:  'oklch(0.88 0.12 55)',
  yellow:  'oklch(0.92 0.12 85)',
  green:   'oklch(0.88 0.10 155)',
  blue:    'oklch(0.88 0.10 245)',
  purple:  'oklch(0.88 0.10 300)',
  pink:    'oklch(0.88 0.10 340)',
  red:     'oklch(0.88 0.12 20)',
};

function PropValue({ prop }) {
  if (!prop) return <span className="nb-db-empty">—</span>;
  switch (prop.type) {
    case 'title':
      return <span>{prop.title?.map((r) => r.plain_text).join('') || '—'}</span>;
    case 'rich_text':
      return <span>{prop.rich_text?.map((r) => r.plain_text).join('') || '—'}</span>;
    case 'number':
      return <span>{prop.number ?? '—'}</span>;
    case 'select':
      return prop.select
        ? <span className="nb-tag" style={{ background: SELECT_COLORS[prop.select.color] || SELECT_COLORS.default }}>{prop.select.name}</span>
        : <span className="nb-db-empty">—</span>;
    case 'status':
      return prop.status
        ? <span className="nb-tag" style={{ background: SELECT_COLORS[prop.status.color] || SELECT_COLORS.default }}>{prop.status.name}</span>
        : <span className="nb-db-empty">—</span>;
    case 'multi_select':
      return prop.multi_select?.length
        ? <div className="nb-tag-row">{prop.multi_select.map((s) => <span key={s.id} className="nb-tag" style={{ background: SELECT_COLORS[s.color] || SELECT_COLORS.default }}>{s.name}</span>)}</div>
        : <span className="nb-db-empty">—</span>;
    case 'date':
      return <span>{prop.date?.start || '—'}</span>;
    case 'checkbox':
      return <input type="checkbox" checked={!!prop.checkbox} readOnly style={{ cursor: 'default' }} />;
    case 'url':
      return prop.url
        ? <a href={prop.url} target="_blank" rel="noreferrer" className="nb-link">{prop.url}</a>
        : <span className="nb-db-empty">—</span>;
    case 'email':
      return <span>{prop.email || '—'}</span>;
    case 'phone_number':
      return <span>{prop.phone_number || '—'}</span>;
    case 'people':
      return <span>{prop.people?.map((p) => p.name || p.id).join(', ') || '—'}</span>;
    case 'formula': {
      const fv = prop.formula;
      if (!fv) return <span className="nb-db-empty">—</span>;
      if (fv.type === 'string') return <span>{fv.string || '—'}</span>;
      if (fv.type === 'number') return <span>{fv.number ?? '—'}</span>;
      if (fv.type === 'boolean') return <input type="checkbox" checked={!!fv.boolean} readOnly style={{ cursor: 'default' }} />;
      if (fv.type === 'date') return <span>{fv.date?.start || '—'}</span>;
      return <span className="nb-db-empty">—</span>;
    }
    default:
      return <span className="nb-db-empty">—</span>;
  }
}

function DatabaseView({ meta, rows }) {
  const dbTitle = meta.title?.map((r) => r.plain_text).join('') || '데이터베이스';
  const props = meta.properties || {};
  // Title column first, then the rest
  const propKeys = Object.keys(props).sort((a, b) => {
    if (props[a].type === 'title') return -1;
    if (props[b].type === 'title') return 1;
    return 0;
  });

  return (
    <div className="nb-body">
      <div className="nb-db-header">
        <span className="nb-db-icon">🗄</span>
        <h1 className="nb-h1" style={{ margin: 0 }}>{dbTitle}</h1>
        <span className="nb-db-count">{rows.length}행</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-mute)', fontSize: 13 }}>항목이 없습니다.</p>
      ) : (
        <div className="nb-db-wrap">
          <table className="nb-db-table">
            <thead>
              <tr>
                {propKeys.map((k) => (
                  <th key={k} className="nb-db-th">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="nb-db-tr">
                  {propKeys.map((k) => (
                    <td key={k} className="nb-db-td">
                      <PropValue prop={row.properties?.[k]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Toggle block (lazy-fetches children) ────────────────────────────────────
function ToggleBlock({ block }) {
  const token = useContext(TokenCtx);
  const data = block[block.type] || {};
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    if (children !== null) { setOpen(true); return; }
    setLoading(true);
    try {
      const res = await notionFetch('blocks', block.id, token);
      setChildren(groupBlocks(res.results || []));
      setOpen(true);
    } catch { setChildren([]); }
    finally { setLoading(false); }
  };

  return (
    <div className="nb-toggle">
      <button className="nb-toggle-hd" onClick={toggle}>
        <span className={'nb-toggle-caret' + (open ? ' open' : '')}>▶</span>
        <span><RichText items={data.rich_text} /></span>
        {loading && <span className="nb-loading">…</span>}
      </button>
      {open && children?.length > 0 && (
        <div className="nb-toggle-body">
          {children.map((child, i) => (
            <NotionBlock key={child.id || child.items?.[0]?.id || i} block={child} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Block list grouping (consecutive list items → ul/ol) ────────────────────
function groupBlocks(blocks) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'bulleted_list_item') {
      const items = [];
      while (i < blocks.length && blocks[i].type === 'bulleted_list_item') items.push(blocks[i++]);
      out.push({ type: '_ul', items });
    } else if (b.type === 'numbered_list_item') {
      const items = [];
      while (i < blocks.length && blocks[i].type === 'numbered_list_item') items.push(blocks[i++]);
      out.push({ type: '_ol', items });
    } else {
      out.push(b); i++;
    }
  }
  return out;
}

// ─── Single block renderer ────────────────────────────────────────────────────
function NotionBlock({ block }) {
  const type = block.type;

  if (type === '_ul') {
    return (
      <ul className="nb-ul">
        {block.items.map((item, i) => (
          <li key={item.id || i}><RichText items={item.bulleted_list_item?.rich_text} /></li>
        ))}
      </ul>
    );
  }
  if (type === '_ol') {
    return (
      <ol className="nb-ol">
        {block.items.map((item, i) => (
          <li key={item.id || i}><RichText items={item.numbered_list_item?.rich_text} /></li>
        ))}
      </ol>
    );
  }

  const data = block[type] || {};
  const rt = data.rich_text || [];

  switch (type) {
    case 'paragraph':
      return <p className="nb-p"><RichText items={rt} /></p>;
    case 'heading_1':
      return <h1 className="nb-h1"><RichText items={rt} /></h1>;
    case 'heading_2':
      return <h2 className="nb-h2"><RichText items={rt} /></h2>;
    case 'heading_3':
      return <h3 className="nb-h3"><RichText items={rt} /></h3>;
    case 'to_do':
      return (
        <div className="nb-todo">
          <input type="checkbox" checked={!!data.checked} readOnly />
          <span style={{ textDecoration: data.checked ? 'line-through' : 'none', opacity: data.checked ? 0.55 : 1 }}>
            <RichText items={rt} />
          </span>
        </div>
      );
    case 'code':
      return (
        <pre className="nb-pre">
          <code>{rt.map((r) => r.plain_text).join('')}</code>
        </pre>
      );
    case 'quote':
      return <blockquote className="nb-quote"><RichText items={rt} /></blockquote>;
    case 'divider':
      return <hr className="nb-hr" />;
    case 'image': {
      const src = data.type === 'external' ? data.external?.url : data.file?.url;
      const cap = data.caption?.map((r) => r.plain_text).join('') || '';
      return src ? (
        <figure className="nb-figure">
          <img src={src} alt={cap} className="nb-img" />
          {cap && <figcaption className="nb-caption">{cap}</figcaption>}
        </figure>
      ) : null;
    }
    case 'callout':
      return (
        <div className="nb-callout">
          <span className="nb-callout-ico">{data.icon?.emoji || '💡'}</span>
          <div><RichText items={rt} /></div>
        </div>
      );
    case 'toggle':
      return <ToggleBlock block={block} />;
    case 'child_page':
      return <div className="nb-child-page">📄 {data.title}</div>;
    default:
      return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NotionTab({ projectId, project, updateProject }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [activePage, setActivePage] = useState(null);
  const [viewType, setViewType] = useState('page'); // 'page' | 'database'
  const [blocks, setBlocks] = useState([]);
  const [databaseMeta, setDatabaseMeta] = useState(null);
  const [databaseRows, setDatabaseRows] = useState([]);
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

  // Sync token from Firestore project doc
  useEffect(() => {
    const t = project?.notionToken || '';
    setToken(t);
    setTokenInput(t);
  }, [project?.notionToken]);

  // Auto-select first page
  useEffect(() => {
    if (!activePage && pages.length > 0) setActivePage(pages[0]);
  }, [pages, activePage]);

  // Fetch blocks when active page or token changes
  useEffect(() => {
    if (!activePage || !token) return;
    fetchPageContent(activePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.id, token]);

  const fetchPageContent = async (page) => {
    const pageId = extractPageId(page.url);
    if (!pageId) { setError('유효한 Notion URL이 아닙니다. URL을 다시 확인하세요.'); return; }

    setLoading(true);
    setError('');
    setBlocks([]);
    setDatabaseMeta(null);
    setDatabaseRows([]);
    setPageTitle('');

    try {
      // Auto-detect: try page first, fall back to database
      let meta = await notionFetchRaw('page', pageId, token);

      if (meta.object === 'error') {
        // Try as database
        meta = await notionFetchRaw('database', pageId, token);
        if (meta.object === 'error') throw new Error(meta.message || '페이지/데이터베이스를 불러올 수 없습니다');

        const dbTitle = meta.title?.map((r) => r.plain_text).join('') || page.name;
        setPageTitle(dbTitle);
        setDatabaseMeta(meta);
        setViewType('database');

        const query = await notionFetchRaw('database_query', pageId, token);
        if (query.object === 'error') throw new Error(query.message);
        setDatabaseRows(query.results || []);
      } else {
        // It's a page — extract title and blocks
        const titleProp = meta.properties?.title || meta.properties?.Name;
        setPageTitle(titleProp?.title?.[0]?.plain_text || page.name);
        setViewType('page');

        const blocksData = await notionFetch('blocks', pageId, token);
        setBlocks(groupBlocks(blocksData.results || []));
      }
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

  return (
    <div className="notion-main">
      {/* ── Left sidebar ── */}
      <aside className="notion-sidebar">
        {/* Token setup row */}
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

        {/* Token setup panel */}
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
                <button className="btn sm" style={{ color: 'var(--rose)' }} onClick={() => { updateProject?.({ notionToken: null }); setToken(''); setTokenInput(''); setShowTokenSetup(false); }}>
                  연결 해제
                </button>
              )}
              <button className="btn sm" onClick={() => setShowTokenSetup(false)}>취소</button>
            </div>
          </div>
        )}

        {/* Add page form */}
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

        {/* No token warning */}
        {!token && !showTokenSetup && (
          <div className="notion-no-token">
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
            <div style={{ marginBottom: 10, fontSize: 12 }}>Integration 토큰을 설정해야<br />페이지를 불러올 수 있습니다.</div>
            <button className="btn accent sm" onClick={() => setShowTokenSetup(true)}>토큰 설정</button>
          </div>
        )}

        {/* Page list */}
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

      {/* ── Content viewer ── */}
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
                <button className="btn sm" style={{ fontSize: 12 }} onClick={() => fetchPageContent(activePage)} disabled={loading}>
                  {loading ? '…' : '↺'}
                </button>
                <a className="btn sm" href={activePage.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  Notion에서 열기 ↗
                </a>
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
              {token && !loading && !error && viewType === 'database' && databaseMeta && (
                <DatabaseView meta={databaseMeta} rows={databaseRows} />
              )}
              {token && !loading && !error && viewType === 'page' && blocks.length > 0 && (
                <TokenCtx.Provider value={token}>
                  <div className="nb-body">
                    {blocks.map((block, i) => (
                      <NotionBlock key={block.id || block.items?.[0]?.id || i} block={block} />
                    ))}
                  </div>
                </TokenCtx.Provider>
              )}
              {token && !loading && !error && viewType === 'page' && blocks.length === 0 && (
                <div className="notion-content-empty" style={{ color: 'var(--ink-mute)' }}>페이지가 비어있습니다.</div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
