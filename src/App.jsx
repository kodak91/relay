import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import useAppStore from './store/appStore';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Topbar from './components/layout/Topbar';
import LeftSidebar from './components/layout/LeftSidebar';
import RightSidebar from './components/layout/RightSidebar';
import ChatMain from './components/chat/ChatMain';
import AIChannel from './components/ai/AIChannel';
import { useProjects } from './hooks/useProjects';

function ProtectedApp() {
  const { activeChannel, activeProject, user, authLoading } = useAppStore();
  const { projects } = useProjects();
  const msgRefs = useRef({});

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

  // 인증 확인 중이면 로딩 표시 (리다이렉트 금지)
  if (authLoading) return <LoadingScreen />;

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app">
      <Topbar project={currentProject} onStartMeeting={() => {}} />
      <div className="body">
        <LeftSidebar />
        {activeChannel === 'ai' ? (
          <AIChannel />
        ) : (
          <ChatMain msgRefs={msgRefs} onJumpToMessage={jumpToMessage} />
        )}
        <RightSidebar onJumpToMessage={jumpToMessage} />
      </div>
    </div>
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
  // useAuth를 여기서 호출해 onAuthStateChanged 리스너를 등록
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
