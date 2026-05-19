import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import useAppStore from '../../store/appStore';

export default function Topbar({ project, onStartMeeting, projects }) {
  const { role, setRole, user, activeChannel } = useAppStore();
  const setUser = useAppStore((s) => s.setUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = user?.initial || '?';
  const aiActive = activeChannel === 'ai';

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
    if (!menuOpen) {
      setTimeout(() => document.addEventListener('click', () => setMenuOpen(false), { once: true }), 0);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--accent)' }}>
          Relay
        </span>
      </div>

      <div className="center">
        <div className="crumb">
          <span>워크스페이스</span>
          <span className="crumb-sep">/</span>
          <b>{aiActive ? 'Relay AI' : (project?.name || '—')}</b>
        </div>
        {!aiActive && project && (
          <>
            <span className="status-pill">{project.status}</span>
          </>
        )}
        {aiActive && (
          <span className="status-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-line)' }}>AI 채널</span>
        )}
        <div className="search" style={{ marginLeft: 'auto' }}>
          <span>⌕</span>
          <input placeholder="메시지·태스크·파일 검색…" />
          <kbd>⌘K</kbd>
        </div>
      </div>

      <div className="right">
        <button className="icon-btn meeting-btn" onClick={onStartMeeting} title="회의 시작">
          <span style={{ color: 'var(--rose)', fontSize: 8 }}>●</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>회의</span>
        </button>
        <div className="role-switch">
          <button className={role === 'lead' ? 'on' : ''} onClick={() => setRole('lead')}>팀장</button>
          <button className={role === 'member' ? 'on' : ''} onClick={() => setRole('member')}>팀원</button>
        </div>
        <button className="icon-btn" title="알림">
          🔔
          <span className="dot" />
        </button>
        <div className="user-menu-wrap">
          <button
            className="avatar-me"
            style={{ background: 'oklch(0.45 0.20 270)' }}
            onClick={handleMenuClick}
          >
            {initial}
          </button>
          {menuOpen && (
            <div className="user-menu" onClick={(e) => e.stopPropagation()}>
              <div className="user-menu-hd">
                <div className="avatar-me" style={{ background: 'oklch(0.45 0.20 270)', width: 40, height: 40, fontSize: 14 }}>{initial}</div>
                <div>
                  <div className="um-name">{user?.name || '나'}</div>
                  <div className="um-email mono">{user?.email || '—'}</div>
                </div>
              </div>
              <div className="user-menu-list">
                <button>프로필 설정</button>
                <button>알림 관리</button>
                <button>워크스페이스 설정</button>
              </div>
              <div className="user-menu-foot">
                <button onClick={async () => { await signOut(auth); setUser(null); }}>
                  로그아웃 →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
