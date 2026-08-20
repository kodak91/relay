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
import ScopePanel from './components/echo/ScopePanel';
import GlobalSearch from './components/search/GlobalSearch';
import { useProjects } from './hooks/useProjects';

function ProtectedApp() {
  const activeChannel = useAppStore((s) => s.activeChannel);
  const activeProject = useAppStore((s) => s.activeProject);
  const user = useAppStore((s) => s.user);
  const authLoading = useAppStore((s) => s.authLoading);
  const setChatTab = useAppStore((s) => s.setChatTab);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const chatTab = useAppStore((s) => s.chatTab);
  const { projects } = useProjects();
  const msgRefs = useRef({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const currentProject = projects.find((p) => p.id === activeProject);

  // target: 메시지 id(문자열) 또는 { id, createdAt, ... } 메시지 객체.
  // 이미 채팅창에 렌더링된 메시지는 바로 스크롤하고, 아닌 경우(검색 결과 등
  // 로드 범위 밖의 과거 메시지)엔 객체가 있어야 ChatMain이 그 주변을 슬랙식
  // 컨텍스트로 따로 불러올 수 있다.
  const jumpToMessage = (target) => {
    const mid = typeof target === 'string' ? target : target?.id;
    if (!mid) return;
    const el = msgRefs.current[mid];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background 0.4s';
      el.style.background = 'var(--accent-soft)';
      el.style.borderRadius = '12px';
      setTimeout(() => { el.style.background = ''; el.style.borderRadius = ''; }, 1400);
    } else if (typeof target === 'object' && target?.createdAt) {
      useAppStore.getState().setPendingJumpTarget(target);
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

  // 하단 탭바 = 워크스페이스 내 콘텐츠 이동(단일 소스). 보조 섹션은 드로어로.
  const mobileActiveTab = mobilePanelOpen ? 'work'
    : activeChannel === 'ai' ? 'ai'
    : activeChannel === 'echo' ? ''      // Scope 는 하단 강조 없음
    : chatTab === 'kb' ? 'kb'
    : chatTab === 'tickets' ? 'tickets'
    : chatTab === 'tasks' ? 'tasks'
    : chatTab === 'notion' ? ''          // 북마크는 드로어 전용 → 하단 강조 없음
    : 'chat';

  const handleMobileTab = (tabId) => {
    setMobilePanelOpen(false);
    setMobileDrawerOpen(false);
    switch (tabId) {
      case 'projects': setMobileDrawerOpen(true); break;
      case 'work': setMobilePanelOpen(true); break;
      case 'ai': setActiveChannel('ai'); break;
      case 'chat': setActiveChannel('chat'); setChatTab('chat'); break;
      case 'kb': setActiveChannel('chat'); setChatTab('kb'); break;
      case 'notion': setActiveChannel('chat'); setChatTab('notion'); break;
      case 'tickets': setActiveChannel('chat'); setChatTab('tickets'); break;
      case 'tasks': setActiveChannel('chat'); setChatTab('tasks'); break;
      default: break;
    }
  };

  if (authLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app">
      <Topbar project={currentProject} onSearchOpen={() => setSearchOpen(true)} onHamburger={() => setMobileDrawerOpen(true)} />
      <div className="body">
        <LeftSidebar mobileOpen={mobileDrawerOpen} onMobileClose={() => setMobileDrawerOpen(false)} onMobileNav={handleMobileTab} />
        {mobileDrawerOpen && (
          <div className="mob-drawer-overlay" onClick={() => setMobileDrawerOpen(false)} />
        )}
        {activeChannel === 'ai' ? (
          <AIChannel />
        ) : activeChannel === 'echo' ? (
          <ScopePanel />
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
    { id: 'chat', ico: '💬', lbl: '채팅' },
    { id: 'kb', ico: '📚', lbl: '저장소' },
    { id: 'tickets', ico: '🎫', lbl: '워크트리' },
    { id: 'tasks', ico: '📋', lbl: '태스크' },
    { id: 'ai', ico: '✦', lbl: 'AI' },
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
