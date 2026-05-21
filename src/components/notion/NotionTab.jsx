import { useState, useEffect } from 'react';
import { useNotionPages } from '../../hooks/useNotionPages';
import { useBookmarkGroups, useBookmarkItems } from '../../hooks/useBookmarkGroups';

const NOTION_GID = '__notion__';

function parseEmbedSrc(input) {
  const m = input.trim().match(/src=["']([^"']+)["']/);
  return m ? m[1] : input.trim();
}
function getOpenUrl(url) {
  return url?.replace(/\/ebd\/\//, '/') || url;
}

// ─── 사이드바 링크 행 ──────────────────────────────────────────────────────────
function LinkRow({ name, url, isActive, onSelect, onDelete }) {
  return (
    <div className={'bm-link-row' + (isActive ? ' on' : '')} onClick={onSelect}>
      <span className="bm-link-name">{name}</span>
      <a
        className="bm-open-icon"
        href={getOpenUrl(url)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="새 탭에서 열기"
      >↗</a>
      <span className="notion-del-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} role="button" tabIndex={-1}>×</span>
    </div>
  );
}

// ─── Notion 그룹 섹션 ─────────────────────────────────────────────────────────
function NotionSection({ projectId, activeItem, onSelect }) {
  const { pages, addPage, deletePage } = useNotionPages(projectId);
  const [expanded, setExpanded] = useState(true);
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
    <div className="bm-group">
      <div className="bm-group-hd">
        <button className="bm-group-toggle" onClick={() => setExpanded((v) => !v)}>
          <span className="bm-caret">{expanded ? '▾' : '▸'}</span>
          <span>📄</span>
          <span className="bm-group-name">Notion</span>
        </button>
        <button className="bm-group-add" onClick={() => setShowAdd((v) => !v)} title="페이지 추가">+</button>
      </div>

      {showAdd && (
        <div className="bm-inline-form">
          <textarea
            autoFocus rows={2}
            placeholder={'<iframe src="https://...notion.site/ebd//..." />'}
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'none' }}
          />
          <input placeholder="표시 이름" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <div style={{ display: 'flex', gap: 5 }}>
            <button className="btn accent sm" onClick={handleAdd} disabled={!addInput.trim() || adding}>{adding ? '…' : '추가'}</button>
            <button className="btn sm" onClick={() => { setShowAdd(false); setAddInput(''); setAddName(''); }}>취소</button>
          </div>
        </div>
      )}

      {expanded && pages.map((p) => (
        <LinkRow
          key={p.id}
          name={p.name}
          url={p.url}
          isActive={activeItem?.id === p.id && activeItem?.groupId === NOTION_GID}
          onSelect={() => onSelect({ id: p.id, url: p.url, name: p.name, groupId: NOTION_GID })}
          onDelete={() => deletePage(p.id)}
        />
      ))}
    </div>
  );
}

// ─── 커스텀 그룹 섹션 ─────────────────────────────────────────────────────────
function BookmarkSection({ projectId, group, activeItem, onSelect, onDeleteGroup }) {
  const { items, addItem, deleteItem } = useBookmarkItems(projectId, group.id);
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!addUrl.trim() || adding) return;
    setAdding(true);
    await addItem(addUrl.trim(), addName.trim());
    setAddUrl(''); setAddName(''); setShowAdd(false);
    setAdding(false);
  };

  return (
    <div className="bm-group">
      <div className="bm-group-hd">
        <button className="bm-group-toggle" onClick={() => setExpanded((v) => !v)}>
          <span className="bm-caret">{expanded ? '▾' : '▸'}</span>
          <span>📁</span>
          <span className="bm-group-name">{group.name}</span>
        </button>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="bm-group-add" onClick={() => setShowAdd((v) => !v)} title="북마크 추가">+</button>
          <button className="bm-group-add" onClick={onDeleteGroup} title="그룹 삭제" style={{ color: 'var(--ink-mute)' }}>×</button>
        </div>
      </div>

      {showAdd && (
        <div className="bm-inline-form">
          <input autoFocus placeholder="URL *" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <input placeholder="이름 (선택)" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <div style={{ display: 'flex', gap: 5 }}>
            <button className="btn accent sm" onClick={handleAdd} disabled={!addUrl.trim() || adding}>{adding ? '…' : '추가'}</button>
            <button className="btn sm" onClick={() => { setShowAdd(false); setAddUrl(''); setAddName(''); }}>취소</button>
          </div>
        </div>
      )}

      {expanded && items.map((item) => (
        <LinkRow
          key={item.id}
          name={item.name}
          url={item.url}
          isActive={activeItem?.id === item.id && activeItem?.groupId === group.id}
          onSelect={() => onSelect({ id: item.id, url: item.url, name: item.name, groupId: group.id })}
          onDelete={() => deleteItem(item.id)}
        />
      ))}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function NotionTab({ projectId }) {
  const { groups, addGroup, deleteGroup } = useBookmarkGroups(projectId);
  const { pages } = useNotionPages(projectId);
  const [activeItem, setActiveItem] = useState(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // 첫 페이지 자동 선택
  useEffect(() => {
    if (!activeItem && pages.length > 0) {
      setActiveItem({ id: pages[0].id, url: pages[0].url, name: pages[0].name, groupId: NOTION_GID });
    }
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    await addGroup(newGroupName.trim());
    setNewGroupName(''); setShowAddGroup(false);
  };

  const handleDeleteGroup = async (groupId) => {
    if (activeItem?.groupId === groupId) setActiveItem(null);
    await deleteGroup(groupId);
  };

  return (
    <div className="notion-main">
      {/* ── 사이드바 ── */}
      <aside className="notion-sidebar">
        <div className="notion-sidebar-hd">
          <span>북마크</span>
          <button className="notion-add-btn" onClick={() => setShowAddGroup((v) => !v)} title="그룹 추가">+</button>
        </div>

        {showAddGroup && (
          <div className="bm-inline-form" style={{ margin: '0 8px 8px' }}>
            <input
              autoFocus
              placeholder="그룹 이름"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
            />
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="btn accent sm" onClick={handleAddGroup} disabled={!newGroupName.trim()}>추가</button>
              <button className="btn sm" onClick={() => { setShowAddGroup(false); setNewGroupName(''); }}>취소</button>
            </div>
          </div>
        )}

        <NotionSection projectId={projectId} activeItem={activeItem} onSelect={setActiveItem} />

        {groups.map((g) => (
          <BookmarkSection
            key={g.id}
            projectId={projectId}
            group={g}
            activeItem={activeItem}
            onSelect={setActiveItem}
            onDeleteGroup={() => handleDeleteGroup(g.id)}
          />
        ))}
      </aside>

      {/* ── 뷰어 ── */}
      <section className="notion-viewer">
        {!activeItem ? (
          <div className="notion-viewer-empty">
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔖</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>페이지를 선택하세요</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>좌측에서 페이지 또는 북마크를 선택하세요.</div>
          </div>
        ) : (
          <>
            <div className="notion-viewer-toolbar">
              <span className="notion-viewer-title">{activeItem.name}</span>
              <a
                className="btn sm accent"
                href={getOpenUrl(activeItem.url)}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12 }}
              >
                열기 ↗
              </a>
            </div>
            <iframe
              key={activeItem.id}
              src={activeItem.url}
              className="notion-iframe"
              title={activeItem.name}
              allowFullScreen
            />
          </>
        )}
      </section>
    </div>
  );
}
