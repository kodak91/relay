import { useState } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';
import { useBookmarkGroups, useBookmarkItems } from '../../hooks/useBookmarkGroups';

const NOTION_GID = '__notion__';

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}
function getFavicon(url) {
  const d = getDomain(url);
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=32` : null;
}
function parseEmbedSrc(input) {
  const m = input.trim().match(/src=["']([^"']+)["']/);
  return m ? m[1] : input.trim();
}
function getOpenUrl(url) {
  return url?.replace(/\/ebd\/\//, '/') || url;
}

// ─── 북마크 카드 ──────────────────────────────────────────────────────────────
function BookmarkCard({ name, url, description, onDelete }) {
  const favicon = getFavicon(url);
  const domain = getDomain(url);
  const openUrl = getOpenUrl(url);
  return (
    <div className="bm-card">
      <button className="bm-card-del" onClick={onDelete} title="삭제">×</button>
      <div className="bm-card-top">
        {favicon
          ? <img src={favicon} alt="" className="bm-card-favicon" onError={(e) => { e.target.style.display = 'none'; }} />
          : <div className="bm-card-favicon-ph">🔗</div>
        }
        <div className="bm-card-name">{name}</div>
      </div>
      {description && <div className="bm-card-desc">{description}</div>}
      <div className="bm-card-foot">
        <span className="bm-card-domain">{domain}</span>
        <a className="btn sm accent" href={openUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>열기 ↗</a>
      </div>
    </div>
  );
}

// ─── Notion 그룹 패널 ─────────────────────────────────────────────────────────
function NotionGroupPanel({ projectId }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const embedUrl = parseEmbedSrc(addInput);
    if (!embedUrl || adding) return;
    setAdding(true);
    await addPage(embedUrl, addName);
    setAddInput(''); setAddName(''); setShowAdd(false);
    setAdding(false);
  };

  return (
    <div className="bm-panel">
      <div className="bm-panel-hd">
        <span className="bm-panel-title">📄 Notion</span>
        <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>+ 페이지 추가</button>
      </div>

      {showAdd && (
        <div className="bm-add-form">
          <textarea
            autoFocus rows={3}
            placeholder={'임베드 코드 붙여넣기\n예) <iframe src="https://...notion.site/ebd//..." />'}
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            style={{ resize: 'none', fontSize: 12, fontFamily: 'var(--font-mono)' }}
          />
          <input placeholder="표시 이름 (선택)" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>Notion → 공유 → 웹에 게시 → 임베드 코드 복사</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn accent sm" onClick={handleAdd} disabled={!addInput.trim() || adding}>{adding ? '…' : '추가'}</button>
            <button className="btn sm" onClick={() => { setShowAdd(false); setAddInput(''); setAddName(''); }}>취소</button>
          </div>
        </div>
      )}

      {pages.length === 0 && !showAdd ? (
        <div className="bm-empty">
          <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
          <div style={{ marginBottom: 12 }}>Notion 임베드 코드를 추가하세요</div>
          <button className="btn accent sm" onClick={() => setShowAdd(true)}>+ 페이지 추가</button>
        </div>
      ) : (
        <div className="bm-card-grid">
          {pages.map((p) => (
            <BookmarkCard
              key={p.id}
              name={p.name}
              url={p.url}
              description=""
              onDelete={() => deletePage(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 커스텀 그룹 패널 ─────────────────────────────────────────────────────────
function BookmarkGroupPanel({ projectId, groupId, groupName }) {
  const { items, addItem, deleteItem } = useBookmarkItems(projectId, groupId);
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!addUrl.trim() || adding) return;
    setAdding(true);
    await addItem(addUrl.trim(), addName.trim(), addDesc.trim());
    setAddUrl(''); setAddName(''); setAddDesc(''); setShowAdd(false);
    setAdding(false);
  };

  return (
    <div className="bm-panel">
      <div className="bm-panel-hd">
        <span className="bm-panel-title">📁 {groupName}</span>
        <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>+ 북마크 추가</button>
      </div>

      {showAdd && (
        <div className="bm-add-form">
          <input autoFocus placeholder="URL *" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <input placeholder="이름 (선택)" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <input placeholder="설명 (선택)" value={addDesc} onChange={(e) => setAddDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn accent sm" onClick={handleAdd} disabled={!addUrl.trim() || adding}>{adding ? '…' : '추가'}</button>
            <button className="btn sm" onClick={() => { setShowAdd(false); setAddUrl(''); setAddName(''); setAddDesc(''); }}>취소</button>
          </div>
        </div>
      )}

      {items.length === 0 && !showAdd ? (
        <div className="bm-empty">
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔗</div>
          <div style={{ marginBottom: 12 }}>북마크를 추가하세요</div>
          <button className="btn accent sm" onClick={() => setShowAdd(true)}>+ 북마크 추가</button>
        </div>
      ) : (
        <div className="bm-card-grid">
          {items.map((item) => (
            <BookmarkCard
              key={item.id}
              name={item.name}
              url={item.url}
              description={item.description}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function NotionTab({ projectId }) {
  const { groups, addGroup, deleteGroup } = useBookmarkGroups(projectId);
  const [activeGroup, setActiveGroup] = useState(NOTION_GID);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    await addGroup(newGroupName.trim());
    setNewGroupName(''); setShowAddGroup(false);
  };

  const handleDeleteGroup = async (e, groupId) => {
    e.stopPropagation();
    if (activeGroup === groupId) setActiveGroup(NOTION_GID);
    await deleteGroup(groupId);
  };

  const activeGroupName = groups.find((g) => g.id === activeGroup)?.name || '';

  return (
    <div className="notion-main">
      {/* ── 사이드바 ── */}
      <aside className="notion-sidebar">
        <div className="notion-sidebar-hd">
          <span>북마크</span>
          <button className="notion-add-btn" onClick={() => setShowAddGroup((v) => !v)} title="그룹 추가">+</button>
        </div>

        {showAddGroup && (
          <div className="notion-add-form">
            <input
              autoFocus
              placeholder="그룹 이름"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn accent sm" onClick={handleAddGroup} disabled={!newGroupName.trim()}>추가</button>
              <button className="btn sm" onClick={() => { setShowAddGroup(false); setNewGroupName(''); }}>취소</button>
            </div>
          </div>
        )}

        {/* Notion 고정 그룹 */}
        <button
          className={'notion-page-row' + (activeGroup === NOTION_GID ? ' on' : '')}
          onClick={() => setActiveGroup(NOTION_GID)}
        >
          <span className="notion-page-ico">📄</span>
          <span className="notion-page-name">Notion</span>
        </button>

        {/* 커스텀 그룹들 */}
        {groups.map((g) => (
          <button
            key={g.id}
            className={'notion-page-row' + (activeGroup === g.id ? ' on' : '')}
            onClick={() => setActiveGroup(g.id)}
          >
            <span className="notion-page-ico">📁</span>
            <span className="notion-page-name">{g.name}</span>
            <span
              className="notion-del-btn"
              onClick={(e) => handleDeleteGroup(e, g.id)}
              role="button"
              tabIndex={-1}
            >×</span>
          </button>
        ))}
      </aside>

      {/* ── 우측 패널 ── */}
      <section className="notion-viewer" style={{ overflow: 'auto' }}>
        {activeGroup === NOTION_GID
          ? <NotionGroupPanel projectId={projectId} />
          : <BookmarkGroupPanel projectId={projectId} groupId={activeGroup} groupName={activeGroupName} />
        }
      </section>
    </div>
  );
}
