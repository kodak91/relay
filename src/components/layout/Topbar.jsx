import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import useAppStore from '../../store/appStore';
import relaySymbol from '../../assets/relay-symbol.png';
import ProfileModal from '../modals/ProfileModal';
import NotifModal from '../modals/NotifModal';
import { useNotifications } from '../../hooks/useNotifications';

export default function Topbar({ project, projects, onSearchOpen, onHamburger }) {
  const { user, activeChannel } = useAppStore();
  const setUser = useAppStore((s) => s.setUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const { unreadCount } = useNotifications(user?.uid);

  const initial = user?.name ? user.name[0] : '?';
  const aiActive = activeChannel === 'ai';

  const openMenu = (e) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
    if (!menuOpen) {
      setTimeout(() => document.addEventListener('click', () => setMenuOpen(false), { once: true }), 0);
    }
  };

  const open = (setter) => {
    setMenuOpen(false);
    setter(true);
  };

  return (
    <>
      <header className="topbar">
        <button className="mob-hamburger" onClick={onHamburger} aria-label="메뉴">☰</button>
        <div className="brand">
          <img src={relaySymbol} alt="Relay" className="brand-symbol" />
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
          {!aiActive && project && <span className="status-pill">{project.status}</span>}
          {aiActive && (
            <span className="status-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-line)' }}>AI 채널</span>
          )}
          <div className="search" style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={onSearchOpen}>
            <span>⌕</span>
            <input placeholder="메시지·태스크 검색…" readOnly style={{ cursor: 'pointer' }} onFocus={onSearchOpen} />
            <kbd>⌘K</kbd>
          </div>
        </div>

        <div className="right">
          <div className="user-menu-wrap">
            <button className="avatar-me" style={{ background: user?.photoURL ? 'transparent' : 'oklch(0.45 0.20 270)', position: 'relative', overflow: user?.photoURL ? 'hidden' : 'visible', padding: 0 }} onClick={openMenu}>
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : initial}
              {unreadCount > 0 && (
                <span className="avatar-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {menuOpen && (
              <div className="user-menu" onClick={(e) => e.stopPropagation()}>
                <div className="user-menu-hd">
                  <div className="avatar-me" style={{ background: user?.photoURL ? 'transparent' : 'oklch(0.45 0.20 270)', width: 40, height: 40, fontSize: 14, overflow: 'hidden', padding: 0 }}>
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    ) : initial}
                  </div>
                  <div>
                    <div className="um-name">{user?.name || '나'}</div>
                    <div className="um-email mono">{user?.email || '—'}</div>
                  </div>
                </div>
                <div className="user-menu-list">
                  <button onClick={() => open(setShowProfile)}>프로필 설정</button>
                  <button onClick={() => open(setShowNotif)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>알림 관리</span>
                    {unreadCount > 0 && <span className="badge" style={{ fontSize: 10, padding: '1px 6px' }}>{unreadCount}</span>}
                  </button>
                </div>
                <div className="user-menu-foot">
                  <button onClick={async () => { await signOut(auth); setUser(null); }}>로그아웃 →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showNotif && <NotifModal onClose={() => setShowNotif(false)} />}
    </>
  );
}
