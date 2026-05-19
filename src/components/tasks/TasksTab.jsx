import { useState } from 'react';
import { useTasks } from '../../hooks/useTasks';

export default function TasksTab({ projectId }) {
  const { tasks, addTask, toggleTask } = useTasks(projectId);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    await addTask(projectId, { title: newTitle.trim(), fromLead: false });
    setNewTitle('');
    setAdding(false);
  };

  const urgent = tasks.filter((t) => !t.done && t.urgent);
  const open = tasks.filter((t) => !t.done && !t.urgent);
  const done = tasks.filter((t) => t.done);

  const groups = [
    { id: 'urgent', label: '오늘 · 긴급', items: urgent },
    { id: 'open',   label: '진행 중',     items: open },
    { id: 'done',   label: '완료',        items: done },
  ];

  return (
    <div className="tasks-tab">
      <div className="tasks-toolbar">
        <div className="tasks-stats">
          <div><b className="mono">{open.length + urgent.length}</b><span>진행 중</span></div>
          <div><b className="mono">{urgent.length}</b><span>긴급</span></div>
          <div><b className="mono">{done.length}</b><span>완료</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '6px 10px', fontSize: 13, background: 'var(--surface)', outline: 'none', width: 220 }}
            placeholder="+ 태스크 직접 추가"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn accent sm" onClick={handleAdd} disabled={!newTitle.trim() || adding}>추가</button>
        </div>
      </div>

      <div className="tasks-body">
        {groups.map((g) => {
          if (g.items.length === 0) return null;
          return (
            <section key={g.id} className="tasks-group">
              <h3>{g.label} <span className="mono">{g.items.length}</span></h3>
              {g.items.map((t) => (
                <div
                  key={t.id}
                  className={'task-card' + (t.done ? ' done' : '') + (t.urgent ? ' urgent' : '')}
                  onClick={() => toggleTask(projectId, t.id, !t.done)}
                >
                  <div className="task-check" />
                  <div className="task-info">
                    <div className="task-title">{t.title}</div>
                    {t.from && <div className="task-meta">{t.from}</div>}
                  </div>
                  {t.due && <span className={'task-due' + (t.urgent ? ' urgent' : '')}>📅 {t.due}</span>}
                </div>
              ))}
            </section>
          );
        })}
        {tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>태스크가 없습니다</div>
            <div style={{ fontSize: 13 }}>위 입력창에서 태스크를 추가하거나 채팅에서 생성하세요.</div>
          </div>
        )}
      </div>
    </div>
  );
}
