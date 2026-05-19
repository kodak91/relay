import useAppStore from '../../store/appStore';
import { useTasks } from '../../hooks/useTasks';
import { useMessages } from '../../hooks/useMessages';
import { useState } from 'react';

export default function RightSidebar({ onJumpToMessage }) {
  const { role, setRole, activeProject, user } = useAppStore();
  const { tasks } = useTasks(activeProject);
  const { messages } = useMessages(activeProject);

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
        ? <ConfirmSidebar pending={pendingAll} held={heldApprovals} onJump={onJumpToMessage} isLead={isLead} />
        : <TaskSidebar tasks={tasks} projectId={activeProject} />
      }
    </aside>
  );
}

function ConfirmSidebar({ pending, held, onJump, isLead }) {
  return (
    <div className="right-body">
      <div className="r-section">
        <div className="r-hd">
          <h4>⚡ 결정·승인 대기</h4>
          <span className="cnt">{pending.length}건</span>
        </div>
        {pending.length === 0 && held.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '16px 0' }}>
            대기 중인 항목이 없습니다 ✓
          </p>
        ) : null}
        {pending.map((item) => (
          <div key={item.id} className={'r-card ' + item.kind} onClick={() => onJump && onJump(item.id)}>
            <div className="r-tag">{item.tag}</div>
            <div className="r-ttl">{item.title || item.text?.slice(0, 50)}</div>
            <div className="r-foot">
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.ts}</span>
              <div className="actions">
                {isLead ? (
                  item.kind === 'approval' ? <button>결정하기 →</button> : <button>선택하기 →</button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>검토 대기 중</span>
                )}
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
              <div className="r-tag" style={{ background: 'var(--amber-bg)', color: 'oklch(0.42 0.13 70)', borderColor: 'var(--amber-line)' }}>보류</div>
              <div className="r-ttl">{item.text?.slice(0, 50)}</div>
              {item.heldUntil && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>📅 {item.heldUntil}까지</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="r-ai-card">
        <div className="r-ai-hd">
          <span className="ai-dot" />
          <span>AI 현황 요약</span>
        </div>
        <p>AI 채널에서 <b>/오늘요약</b>을 입력하면 하루를 한 번에 파악할 수 있습니다.</p>
      </div>
    </div>
  );
}

function TaskSidebar({ tasks, projectId }) {
  const { addTask, toggleTask } = useTasks(projectId);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const myTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  const handleAdd = async () => {
    if (!newTaskTitle.trim()) return;
    await addTask(projectId, { title: newTaskTitle.trim(), fromLead: false });
    setNewTaskTitle('');
  };

  return (
    <div className="right-body">
      <div className="r-section">
        <div className="r-hd">
          <h4>📋 내 태스크</h4>
          <span className="cnt">{myTasks.length}건 남음</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tasks.map((t) => (
            <div key={t.id} className={'task-row' + (t.done ? ' done' : '')} onClick={() => toggleTask(projectId, t.id, !t.done)}>
              <div className="task-check" />
              <div style={{ flex: 1 }}>
                <span className="task-text">{t.title}</span>
                {t.fromLead && <span className="from">[팀장지시]</span>}
              </div>
              {t.due && <span className={'task-due' + (t.urgent ? ' urgent' : '')}>{t.due}</span>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '5px 8px', fontSize: 12, background: 'var(--surface)', outline: 'none' }}
            placeholder="+ 태스크 직접 추가"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn accent sm" onClick={handleAdd}>추가</button>
        </div>
      </div>

      <div className="r-section">
        <div className="r-hd">
          <h4>📊 이번 주</h4>
        </div>
        <div className="stats">
          <div className="stat"><div className="v">{myTasks.length}</div><div className="l">남은 태스크</div></div>
          <div className="stat"><div className="v">{doneTasks.length}</div><div className="l">완료</div></div>
        </div>
      </div>

      <div className="r-ai-card">
        <div className="r-ai-hd">
          <span className="ai-dot" />
          <span>AI 내 업무 요약</span>
        </div>
        <p>AI 채널에서 <b>/스케줄</b>을 입력하면 오늘/이번 주 마감을 정리해 드립니다.</p>
      </div>
    </div>
  );
}
