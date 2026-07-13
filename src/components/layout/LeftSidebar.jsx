import { useState, useRef, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import { useProjects } from '../../hooks/useProjects';
import { useUnreadCounts } from '../../hooks/useUnreadCounts';
import NewProjectModal from '../chat/NewProjectModal';
import JoinWorkspaceModal from '../chat/JoinWorkspaceModal';
import SlackModal from '../integrations/SlackModal';

const PROJECT_COLORS = [
  'oklch(0.50 0.20 25)',
  'oklch(0.50 0.18 145)',
  'oklch(0.55 0.18 50)',
  'oklch(0.50 0.18 280)',
  'oklch(0.50 0.14 200)',
  'oklch(0.48 0.21 270)',
];

export default function LeftSidebar({ mobileOpen, onMobileClose, onMobileNav }) {
  const { activeProject, setActiveProject, activeChannel, setActiveChannel, user } = useAppStore();
  const { projects, updateProject, deleteProject, joinByCode } = useProjects(user?.uid);
  const active = projects.filter((p) => p.status !== '보관' && p.status !== '삭제됨');
  const { counts: unreadCounts, markRead } = useUnreadCounts(active, user?.uid);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [menuId, setMenuId] = useState(null);
  const menuRef = useRef(null);
  const [showSlackModal, setShowSlackModal] = useState(false);

  const activeProjectData = projects.find((p) => p.id === activeProject) || null;
  const archived = projects.filter((p) => p.status === '보관');

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuId(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // 작업표시줄/홈화면 앱 아이콘에 안읽은 메시지 수를 빨간 뱃지로 표시 (PWA Badging API)
  // 현재 보고 있는 채팅 워크스페이스는 합산에서 제외 (사이드바가 빨간 숫자를 숨기는 것과 동일)
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    const openChatPid = activeChannel === 'chat' ? activeProject : null;
    const total = Object.entries(unreadCounts).reduce(
      (sum, [pid, n]) => sum + (pid === openChatPid ? 0 : (n || 0)),
      0
    );
    if (total > 0) navigator.setAppBadge(total).catch(() => {});
    else navigator.clearAppBadge?.().catch(() => {});
  }, [unreadCounts, activeProject, activeChannel]);

  const startEdit = (p, e) => {
    e.stopPropagation();
    setMenuId(null);
    setEditingId(p.id);
    setEditingName(p.name);
  };

  const confirmEdit = async (id) => {
    if (editingName.trim() && editingName.trim() !== projects.find((p) => p.id === id)?.name) {
      await updateProject(id, { name: editingName.trim(), pf: editingName.trim()[0].toUpperCase() });
    }
    setEditingId(null);
  };

  const archive = async (id) => {
    setMenuId(null);
    await updateProject(id, { status: '보관' });
    if (activeProject === id) setActiveProject(null);
  };

  const unarchive = async (id) => {
    setMenuId(null);
    await updateProject(id, { status: '진행중' });
  };

  const remove = async (id) => {
    setMenuId(null);
    await deleteProject(id);
    if (activeProject === id) setActiveProject(null);
  };

  return (
    <aside className={'col-left' + (mobileOpen ? ' mob-open' : '')}>
      <div className="mob-sidebar-hd">
        <span style={{ fontWeight: 700, fontSize: 14 }}>메뉴</span>
        <button className="mob-sidebar-hd-close" onClick={onMobileClose}>✕</button>
      </div>

      {/* 모바일 전용 바로가기 — 하단 탭바에 없는 보조 섹션 */}
      <div className="mob-quicknav">
        <button onClick={() => { onMobileNav?.('notion'); onMobileClose?.(); }}>
          <span className="q-ico">🔖</span><span>북마크</span>
        </button>
        <button onClick={() => { onMobileNav?.('work'); onMobileClose?.(); }}>
          <span className="q-ico">✓</span><span>내 작업 · 따라잡기</span>
        </button>
      </div>
      <div className="hd">
        <h3>워크스페이스</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="new-btn" onClick={() => setShowNewProject(true)}>+ 새 프로젝트</button>
          <button className="new-btn" onClick={() => setShowJoin(true)}>+ 참가</button>
        </div>
      </div>

      <div className="proj-list">
        {active.map((p) => (
          <ProjectItem
            key={p.id}
            p={p}
            active={activeProject === p.id && activeChannel === 'chat'}
            editing={editingId === p.id}
            editingName={editingName}
            menuOpen={menuId === p.id}
            unreadCount={unreadCounts[p.id] || 0}
            onEditNameChange={setEditingName}
            onEditConfirm={() => confirmEdit(p.id)}
            onMenuOpen={(e) => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id); }}
            onStartEdit={(e) => startEdit(p, e)}
            onArchive={() => archive(p.id)}
            onDelete={() => remove(p.id)}
            onClick={() => { markRead(p.id); setActiveProject(p.id); setActiveChannel('chat'); }}
            menuRef={menuId === p.id ? menuRef : null}
          />
        ))}

        {archived.length > 0 && (
          <>
            <div className="proj-section" style={{ marginTop: 8 }}>보관됨</div>
            {archived.map((p) => (
              <ProjectItem
                key={p.id}
                p={p}
                active={false}
                muted
                editing={editingId === p.id}
                editingName={editingName}
                menuOpen={menuId === p.id}
                onEditNameChange={setEditingName}
                onEditConfirm={() => confirmEdit(p.id)}
                onMenuOpen={(e) => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id); }}
                onStartEdit={(e) => startEdit(p, e)}
                onArchive={() => unarchive(p.id)}
                archiveLabel="복원"
                onDelete={() => remove(p.id)}
                onClick={() => { setActiveProject(p.id); setActiveChannel('chat'); }}
                menuRef={menuId === p.id ? menuRef : null}
              />
            ))}
          </>
        )}
      </div>

      {/* External integrations */}
      <div className="integ-section">
        <div className="integ-hd">도구 · 외부 연동</div>
        <button
          className="integ-row"
          onClick={() => setShowSlackModal(true)}
          title={activeProjectData ? `${activeProjectData.name} Slack 설정` : '프로젝트를 먼저 선택하세요'}
        >
          <span className="slack-ico sm">S</span>
          <span>Slack</span>
          {activeProjectData?.slackWebhook
            ? <span className="integ-status on">● 연결됨</span>
            : <span className="integ-status">설정</span>
          }
        </button>
      </div>

      <div
        className={'ai-channel' + (activeChannel === 'ai' ? ' on' : '')}
        onClick={() => setActiveChannel('ai')}
      >
        <div className="hd2">
          <span className="ai-dot" />
          <span>Relay AI</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>online</span>
        </div>
        <p>슬래시 명령어로 호출 ·<br />/오늘요약  /스케줄</p>
      </div>

      {/* Relay Scope — 조직원 캡처 + 성과 평가 (팀장 전용 진입) */}
      {user?.role === 'lead' && (
        <div
          className={'ai-channel' + (activeChannel === 'echo' ? ' on' : '')}
          onClick={() => setActiveChannel('echo')}
          style={{ marginTop: 8 }}
        >
          <div className="hd2">
            <span>🔭</span>
            <span>Relay Scope</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>Capsule·PR</span>
          </div>
          <p>역할 캡슐 + 분기 성과 평가</p>
        </div>
      )}

      {showSlackModal && (
        <SlackModal
          project={activeProjectData}
          onClose={() => setShowSlackModal(false)}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          colors={PROJECT_COLORS}
          onClose={() => setShowNewProject(false)}
        />
      )}
      {showJoin && (
        <JoinWorkspaceModal
          user={user}
          joinByCode={joinByCode}
          onClose={() => setShowJoin(false)}
        />
      )}
    </aside>
  );
}

function ProjectItem({ p, active, onClick, muted, editing, editingName, menuOpen, unreadCount = 0, onEditNameChange, onEditConfirm, onMenuOpen, onStartEdit, onArchive, archiveLabel = '보관', onDelete, menuRef }) {
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  return (
    <div
      className={'proj' + (active ? ' on' : '')}
      style={{ opacity: muted ? 0.6 : 1, position: 'relative' }}
      onClick={onClick}
    >
      <div className="pf" style={{ background: p.color }}>{p.pf}</div>
      <div className="nm" style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            className="proj-rename-input"
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={onEditConfirm}
            onKeyDown={(e) => { if (e.key === 'Enter') onEditConfirm(); if (e.key === 'Escape') { onEditNameChange(p.name); onEditConfirm(); } }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          p.name
        )}
      </div>
      <div className="meta" style={{ position: 'relative' }}>
        {unreadCount > 0 && !active && <span className="unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        <button className="proj-menu-btn" onClick={onMenuOpen} title="편집">⋯</button>
        {menuOpen && (
          <div className="proj-menu" ref={menuRef}>
            <button onClick={onStartEdit}>이름 변경</button>
            <button onClick={onArchive}>{archiveLabel}</button>
            <button className="danger" onClick={onDelete}>삭제</button>
          </div>
        )}
      </div>
    </div>
  );
}
