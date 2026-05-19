import { useState } from 'react';
import useAppStore from '../../store/appStore';
import { useProjects } from '../../hooks/useProjects';
import { useGlobalTasks } from '../../hooks/useGlobalTasks';
import { useGlobalMessages } from '../../hooks/useGlobalMessages';

const CATCHUP_TYPES = ['approval', 'decision', 'vote', 'update', 'announce', 'meeting'];

const TYPE_LABELS = {
  approval: '승인', decision: '결정', vote: '투표',
  update: '보고', announce: '공지', meeting: '회의',
};

export default function RightSidebar({ onJumpToMessage }) {
  const { role, setRole, activeProject, user } = useAppStore();
  const { projects } = useProjects();

  // Global — across ALL workspaces
  const { tasks, addTask, toggleTask } = useGlobalTasks(projects);
  const { messages } = useGlobalMessages(projects);

  const pendingApprovals = messages.filter((m) => m.type === 'approval' && m.status === 'pending');
  const heldApprovals = messages.filter((m) => m.type === 'approval' && m.status === 'held');
  const pendingDecisions = messages.filter((m) => m.type === 'decision' && !m.chosen);
  const pendingAll = [
    ...pendingApprovals.map((m) => ({ ...m, tag: '승인', kind: 'approval' })),
    ...pendingDecisions.map((m) => ({ ...m, tag: '결정', kind: 'decision' })),
  ];

  const myTasks = tasks.filter((t) => !t.done);
  const isLead = user?.role === 'lead';

  return (
    <aside className="col-right">
      <div className="right-tabs">
        <button className={'right-tab' + (role === 'lead' ? ' on' : '')} onClick={() => setRole('lead')}>
          컨펌 대기
          <span className="cnt">{pendingAll.length + heldApprovals.length}</span>
        </button>
        <button className={'right-tab' + (role === 'member' ? ' on' : '')} onClick={() => setRole('member')}>
          태스크 관리
          <span className="cnt">{myTasks.length}</span>
        </button>
      </div>

      {role === 'lead'
        ? <ConfirmSidebar pending={pendingAll} held={heldApprovals} catchup={messages} onJump={onJumpToMessage} isLead={isLead} />
        : <TaskSidebar tasks={tasks} addTask={addTask} toggleTask={toggleTask} activeProject={activeProject} />
      }
    </aside>
  );
}

function CatchupSection({ messages, onJump }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('catchup_dismissed') || '[]')); }
    catch { return new Set(); }
  });

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('catchup_dismissed', JSON.stringify([...next]));
      return next;
    });
  };

  const visible = messages.filter((m) => !dismissed.has(m.id));

  return (
    <div className="r-section">
      <div className="r-hd" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <h4>⚡ 따라잡기</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="cnt">{visible.length}건</span>
          <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visible.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '10px 0' }}>모두 확인했습니다 ✓</p>
          )}
          {visible.map((m) => (
            <div key={m.id} className="catchup-item">
              <label className="catchup-check">
                <input type="checkbox" onChange={() => dismiss(m.id)} />
              </label>
              <div className="catchup-body" onClick={() => onJump && onJump(m.id)}>
                <span className="catchup-tag">{TYPE_LABELS[m.type] || m.type}</span>
                {m.projectName && <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{m.projectName}</span>}
                <span className="catchup-text">{m.title || m.text?.slice(0, 36) || '(내용 없음)'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmSidebar({ pending, held, catchup, onJump, isLead }) {
  return (
    <div className="right-body">
      <CatchupSection messages={catchup} onJump={onJump} />

      <div className="r-section">
        <div className="r-hd">
          <h4>결정·승인 대기</h4>
          <span className="cnt">{pending.length}건</span>
        </div>
        {pending.length === 0 && held.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '16px 0' }}>
            대기 중인 항목이 없습니다 ✓
          </p>
        )}
        {pending.map((item) => (
          <div key={item.id} className={'r-card ' + item.kind} onClick={() => onJump && onJump(item.id)}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <div className="r-tag">{item.tag}</div>
              {item.projectName && <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{item.projectName}</span>}
            </div>
            <div className="r-ttl">{item.title || item.text?.slice(0, 50)}</div>
            <div className="r-foot">
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.ts}</span>
              <div className="actions">
                {isLead
                  ? <button>{item.kind === 'approval' ? '결정하기 →' : '선택하기 →'}</button>
                  : <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>검토 대기 중</span>
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      {held.length > 0 && (
        <div className="r-section">
          <div className="r-hd">
            <h4>⏸ 보류 중</h4>
            <span className="cnt">{held.length}건</span>
          </div>
          {held.map((item) => (
            <div key={item.id} className="r-card held" onClick={() => onJump && onJump(item.id)}>
              <div className="r-tag" style={{ color: 'oklch(0.42 0.13 70)' }}>보류</div>
              <div className="r-ttl">{item.text?.slice(0, 50)}</div>
              {item.heldUntil && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>📅 {item.heldUntil}까지</div>}
            </div>
          ))}
        </div>
      )}

      <div className="r-ai-card">
        <div className="r-ai-hd"><span className="ai-dot" /><span>AI 현황 요약</span></div>
        <p>AI 채널에서 <b>/오늘요약</b>을 입력하면 하루를 한 번에 파악할 수 있습니다.</p>
      </div>
    </div>
  );
}

function TaskSidebar({ tasks, addTask, toggleTask, activeProject }) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const myTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  const handleAdd = async () => {
    if (!newTaskTitle.trim() || !activeProject) return;
    await addTask(activeProject, { title: newTaskTitle.trim(), fromLead: false });
    setNewTaskTitle('');
  };

  // Group tasks by project
  const byProject = {};
  tasks.forEach((t) => {
    if (!byProject[t.projectId]) byProject[t.projectId] = { name: t.projectName, tasks: [] };
    byProject[t.projectId].tasks.push(t);
  });

  return (
    <div className="right-body">
      <div className="r-section">
        <div className="r-hd">
          <h4>📋 전체 태스크</h4>
          <span className="cnt">{myTasks.length}건 남음</span>
        </div>
        {Object.values(byProject).map((group) => (
          <div key={group.name} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-mute)', marginBottom: 3, fontFamily: 'var(--font-mono)' }}>{group.name}</div>
            {group.tasks.map((t) => (
              <div key={t.id} className={'task-row' + (t.done ? ' done' : '')} onClick={() => toggleTask(t.projectId, t.id, !t.done)}>
                <div className="task-check" />
                <div style={{ flex: 1 }}>
                  <span className="task-text">{t.title}</span>
                  {t.fromLead && <span className="from">[팀장지시]</span>}
                </div>
                {t.due && <span className={'task-due' + (t.urgent ? ' urgent' : '')}>{t.due}</span>}
              </div>
            ))}
          </div>
        ))}
        {tasks.length === 0 && <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '12px 0' }}>태스크가 없습니다</p>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '5px 8px', fontSize: 12, background: 'var(--surface)', outline: 'none' }}
            placeholder={activeProject ? '+ 태스크 추가 (현재 워크스페이스)' : '워크스페이스를 선택하세요'}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            disabled={!activeProject}
          />
          <button className="btn accent sm" onClick={handleAdd} disabled={!activeProject}>추가</button>
        </div>
      </div>

      <div className="r-section">
        <div className="r-hd"><h4>📊 현황</h4></div>
        <div className="stats">
          <div className="stat"><div className="v">{myTasks.length}</div><div className="l">남은 태스크</div></div>
          <div className="stat"><div className="v">{doneTasks.length}</div><div className="l">완료</div></div>
        </div>
      </div>

      <div className="r-ai-card">
        <div className="r-ai-hd"><span className="ai-dot" /><span>AI 내 업무 요약</span></div>
        <p>AI 채널에서 <b>/스케줄</b>을 입력하면 오늘/이번 주 마감을 정리해 드립니다.</p>
      </div>
    </div>
  );
}
