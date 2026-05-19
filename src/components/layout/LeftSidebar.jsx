import useAppStore from '../../store/appStore';
import { useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import NewProjectModal from '../chat/NewProjectModal';

const PROJECT_COLORS = [
  'oklch(0.50 0.20 25)',
  'oklch(0.50 0.18 145)',
  'oklch(0.55 0.18 50)',
  'oklch(0.50 0.18 280)',
  'oklch(0.50 0.14 200)',
  'oklch(0.48 0.21 270)',
];

export default function LeftSidebar() {
  const { activeProject, setActiveProject, activeChannel, setActiveChannel } = useAppStore();
  const { projects } = useProjects();
  const [showNewProject, setShowNewProject] = useState(false);

  const inProgress = projects.filter((p) => p.status === '진행중');
  const other = projects.filter((p) => p.status !== '진행중');

  return (
    <aside className="col-left">
      <div className="hd">
        <h3>워크스페이스</h3>
        <button className="new-btn" onClick={() => setShowNewProject(true)}>+ 새 프로젝트</button>
      </div>

      <div className="proj-list">
        {inProgress.length > 0 && <div className="proj-section">진행중</div>}
        {inProgress.map((p) => (
          <ProjectItem key={p.id} p={p} active={activeProject === p.id && activeChannel === 'chat'}
            onClick={() => { setActiveProject(p.id); setActiveChannel('chat'); }} />
        ))}
        {other.length > 0 && <div className="proj-section">대기 · 완료</div>}
        {other.map((p) => (
          <ProjectItem key={p.id} p={p} active={activeProject === p.id && activeChannel === 'chat'}
            onClick={() => { setActiveProject(p.id); setActiveChannel('chat'); }}
            muted={p.status === '완료'} />
        ))}
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

      {showNewProject && (
        <NewProjectModal
          colors={PROJECT_COLORS}
          onClose={() => setShowNewProject(false)}
        />
      )}
    </aside>
  );
}

function ProjectItem({ p, active, onClick, muted }) {
  return (
    <div
      className={'proj' + (active ? ' on' : '')}
      style={{ opacity: muted ? 0.55 : 1 }}
      onClick={onClick}
    >
      <div className="pf" style={{ background: p.color }}>{p.pf}</div>
      <div className="nm">{p.name}</div>
      <div className="meta">
        {p.unreadCount > 0 && <span className="badge">{p.unreadCount}</span>}
        {p.status !== '진행중' && <span className="badge muted">{p.status}</span>}
      </div>
    </div>
  );
}
