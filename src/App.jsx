import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import useAppStore from './store/appStore';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Topbar from './components/layout/Topbar';
import LeftSidebar from './components/layout/LeftSidebar';
import RightSidebar from './components/layout/RightSidebar';
import ChatMain from './components/chat/ChatMain';
import AIChannel from './components/ai/AIChannel';
import GlobalSearch from './components/search/GlobalSearch';
import { useProjects } from './hooks/useProjects';

function ProtectedApp() {
  const { activeChannel, activeProject, user, authLoading, setChatTab, setActiveChannel, chatTab } = useAppStore();
  const { projects } = useProjects();
  const msgRefs = useRef({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const currentProject = projects.find((p) => p.id === activeProject);

  const jumpToMessage = (mid) => {
    const el = msgRefs.current[mid];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background 0.4s';
      el.style.background = 'var(--accent-soft)';
      el.style.borderRadius = '12px';
      setTimeout(() => { el.style.background = ''; el.style.borderRadius = ''; }, 1400);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => { setMobileDrawerOpen(false); }, [activeProject, activeChannel]);

  const mobileActiveTab = mobilePanelOpen ? 'work'
    : activeChannel === 'ai' ? 'ai'
    : (chatTab === 'kb' || chatTab === 'notion') ? 'kb'
    : 'chat';

  const handleMobileTab = (tabId) => {
    setMobilePanelOpen(false);
    if (tabId === 'projects') { setMobileDrawerOpen(true); return; }
    if (tabId === 'work') { setMobilePanelOpen(true); return; }
    if (tabId === 'ai') { setActiveChannel('ai'); return; }
    if (tabId === 'chat') { setActiveChannel('chat'); setChatTab('chat'); return; }
    if (tabId === 'kb') { setActiveChannel('chat'); setChatTab('kb'); return; }
  };

  if (authLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app">
      <Topbar project={currentProject} onSearchOpen={() => setSearchOpen(true)} onHamburger={() => setMobileDrawerOpen(true)} />
      <div className="body">
        <LeftSidebar mobileOpen={mobileDrawerOpen} onMobileClose={() => setMobileDrawerOpen(false)} />
        {mobileDrawerOpen && (
          <div className="mob-drawer-overlay" onClick={() => setMobileDrawerOpen(false)} />
        )}
        {activeChannel === 'ai' ? (
          <AIChannel />
        ) : (
          <ChatMain msgRefs={msgRefs} onJumpToMessage={jumpToMessage} />
        )}
        <RightSidebar onJumpToMessage={jumpToMessage} mobilePanel={mobilePanelOpen} onMobilePanelClose={() => setMobilePanelOpen(false)} />
      </div>
      <MobileTabBar activeTab={mobileActiveTab} onTab={handleMobileTab} />
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        projects={projects}
        onJumpToMessage={jumpToMessage}
      />
    </div>
  );
}

function MobileTabBar({ activeTab, onTab }) {
  const tabs = [
    { id: 'projects', ico: '☰', lbl: '채널' },
    { id: 'chat', ico: '💬', lbl: '채팅' },
    { id: 'kb', ico: '📁', lbl: 'KB' },
    { id: 'ai', ico: '✦', lbl: 'AI' },
    { id: 'work', ico: '✓', lbl: '업무' },
  ];
  return (
    <nav className="mob-tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={'mob-tab' + (activeTab === t.id ? ' on' : '')} onClick={() => onTab(t.id)}>
          <span className="mob-tab-ico">{t.ico}</span>
          <span className="mob-tab-lbl">{t.lbl}</span>
        </button>
      ))}
    </nav>
  );
}

function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--accent)' }}>Relay</span>
        <span className="ai-typing"><span /><span /><span /></span>
      </div>
    </div>
  );
}

function AppLoader() {
  useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<ProtectedApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppLoader;
