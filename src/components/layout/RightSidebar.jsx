import { useState, useEffect, useRef, useMemo } from 'react';
import useAppStore from '../../store/appStore';
import { useProjects } from '../../hooks/useProjects';
import { useGlobalMessages } from '../../hooks/useGlobalMessages';
import { usePersonalTasks } from '../../hooks/usePersonalTasks';

const TYPE_LABELS = {
  approval: '승인', decision: '결정', vote: '투표',
  update: '보고', announce: '공지', meeting: '회의',
};

export default function RightSidebar({ onJumpToMessage }) {
  const { activeProject, user } = useAppStore();
  const { projects } = useProjects();
  const [tab, setTab] = useState('confirm');

  useEffect(() => {
    if (user?.role === 'member') setTab('tasks');
    else setTab('confirm');
  }, [user?.role]);

  const activeProjects = (projects || []).filter((p) => p.status !== '보관' && p.status !== '삭제됨');
  const { messages } = useGlobalMessages(activeProjects);
  const { tasks } = usePersonalTasks(user?.uid);

  const pendingApprovals = messages.filter((m) => m.type === 'approval' && (!m.status || m.status === 'pending'));
  const heldApprovals = messages.filter((m) => m.type === 'approval' && m.status === 'held');
  const pendingDecisions = messages.filter((m) => m.type === 'decision' && !m.chosen);
  const pendingAll = [
    ...pendingApprovals.map((m) => ({ ...m, tag: '승인', kind: 'approval' })),
    ...pendingDecisions.map((m) => ({ ...m, tag: '결정', kind: 'decision' })),
  ];

  const myTasks = tasks.filter((t) => !t.done);
  const isLead = user?.role === 'lead';

  const POSITION_COLORS = {
    '대표': 'oklch(0.38 0.18 270)',
    '부장': 'oklch(0.45 0.16 270)',
    '팀장': 'oklch(0.48 0.21 270)',
    '대리': 'oklch(0.52 0.12 160)',
    '사원': 'oklch(0.55 0.10 80)',
  };
  const posColor = POSITION_COLORS[user?.position] || 'var(--ink-3)';

  return (
    <aside className="col-right">
      <div className="position-bar">
        <span className="position-badge" style={{ background: posColor }}>
          {user?.position || '—'}
        </span>
        <span className="position-name">{user?.name}</span>
      </div>

      <div className="right-tabs">
        <button className={'right-tab' + (tab === 'confirm' ? ' on' : '')} onClick={() => setTab('confirm')}>
          컨펌 대기
          <span className="cnt">{pendingAll.length + heldApprovals.length}</span>
        </button>
        <button className={'right-tab' + (tab === 'tasks' ? ' on' : '')} onClick={() => setTab('tasks')}>
          내 태스크
          <span className="cnt">{myTasks.length}</span>
        </button>
      </div>

      {tab === 'confirm'
        ? <ConfirmSidebar pending={pendingAll} held={heldApprovals} catchup={messages} onJump={onJumpToMessage} isLead={isLead} uid={user?.uid} />
        : <TaskSidebar uid={user?.uid} />
      }
    </aside>
  );
}

function CatchupSection({ messages, onJump, uid }) {
  const storageKey = uid ? `catchup_dismissed_${uid}` : 'catchup_dismissed';
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
    catch { return new Set(); }
  });
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const seenIds = useRef(null);

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  };

  const visible = useMemo(
    () => messages.filter((m) => !dismissed.has(m.id)),
    [messages, dismissed]
  );

  useEffect(() => {
    if (notifPerm !== 'granted') return;
    if (seenIds.current === null) {
      seenIds.current = new Set(visible.map((m) => m.id));
      return;
    }
    visible.forEach((m) => {
      if (!seenIds.current.has(m.id)) {
        new Notification('Relay — 따라잡기', {
          body: `${TYPE_LABELS[m.type] || m.type}: ${m.title || m.text?.slice(0, 60) || '(내용 없음)'}`,
          icon: '/favicon.ico',
        });
      }
    });
    seenIds.current = new Set(visible.map((m) => m.id));
  }, [visible, notifPerm]);

  const requestNotif = async (e) => {
    e.stopPropagation();
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  return (
    <div className="r-section">
      <div className="r-hd" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <h4>⚡ 따라잡기</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {notifPerm !== 'granted' && typeof Notification !== 'undefined' && (
            <button className="catchup-notif-btn" onClick={requestNotif} title="알림 허용">🔔 알림</button>
          )}
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

function ConfirmSidebar({ pending, held, catchup, onJump, isLead, uid }) {
  return (
    <div className="right-body">
      <CatchupSection messages={catchup} onJump={onJump} uid={uid} />

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

const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

function TaskSidebar({ uid }) {
  const { todayTasks, overdueTasks, weekStats, addTask, toggleTask, deleteTask } = usePersonalTasks(uid);
  const [newTitle, setNewTitle] = useState('');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayLabel = today.toLocaleDateString('ko', { month: 'numeric', day: 'numeric', weekday: 'short' });

  const handleAdd = async () => {
    if (!newTitle.trim() || !uid) return;
    await addTask(newTitle.trim());
    setNewTitle('');
  };

  const activeTasks = [...overdueTasks, ...todayTasks.filter((t) => !t.done)];
  const doneTodayTasks = todayTasks.filter((t) => t.done);

  return (
    <div className="right-body">
      {/* Weekly summary */}
      <div className="r-section">
        <div className="r-hd"><h4>📊 이번 주 현황</h4></div>
        <div className="week-grid">
          {weekStats.map((ws, i) => (
            <div key={ws.date} className={'week-day' + (ws.date === todayStr ? ' today' : '')}>
              <div className="wd-label">{WEEK_DAYS[i]}</div>
              <div className="wd-done">{ws.done}</div>
              <div className="wd-sep">/</div>
              <div className="wd-total">{ws.total || '—'}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>완료 / 전체</div>
      </div>

      {/* Daily tasks */}
      <div className="r-section">
        <div className="r-hd">
          <h4>📋 오늘 업무
            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-mute)', marginLeft: 6 }}>{todayLabel}</span>
          </h4>
          <span className="cnt">{activeTasks.length}건 남음</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '5px 8px', fontSize: 12, background: 'var(--surface)', outline: 'none' }}
            placeholder="+ 할 일 추가…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn accent sm" onClick={handleAdd} disabled={!uid}>추가</button>
        </div>

        {activeTasks.length === 0 && doneTodayTasks.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '10px 0' }}>
            오늘 할 일을 추가해보세요
          </p>
        )}

        {/* Overdue (rolled over from previous days) */}
        {overdueTasks.length > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--rose)', margin: '0 0 4px', letterSpacing: '0.03em' }}>
            이월 {overdueTasks.length}건
          </div>
        )}
        {overdueTasks.map((t) => (
          <div key={t.id} className="task-row overdue" onClick={() => toggleTask(t.id, true)}>
            <div className="task-check" />
            <span className="task-text" style={{ flex: 1 }}>{t.title}</span>
            {t.date && <span className="task-date">{t.date.slice(5)}</span>}
            {t.assignedBy && <span className="task-assigned">by {t.assignedBy}</span>}
            <button style={{ border: 0, background: 'transparent', color: 'var(--ink-mute)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>×</button>
          </div>
        ))}

        {/* Today's incomplete */}
        {todayTasks.filter((t) => !t.done).map((t) => (
          <div key={t.id} className="task-row" onClick={() => toggleTask(t.id, true)}>
            <div className="task-check" />
            <span className="task-text" style={{ flex: 1 }}>{t.title}</span>
            {t.assignedBy && <span className="task-assigned">by {t.assignedBy}</span>}
            <button style={{ border: 0, background: 'transparent', color: 'var(--ink-mute)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>×</button>
          </div>
        ))}

        {/* Completed today */}
        {doneTodayTasks.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--emerald)', margin: '8px 0 4px', letterSpacing: '0.03em' }}>
              완료 {doneTodayTasks.length}건
            </div>
            {doneTodayTasks.map((t) => (
              <div key={t.id} className="task-row done" onClick={() => toggleTask(t.id, false)}>
                <div className="task-check done-check" />
                <span className="task-text" style={{ flex: 1 }}>{t.title}</span>
                <button style={{ border: 0, background: 'transparent', color: 'var(--ink-mute)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}>×</button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="r-ai-card">
        <div className="r-ai-hd"><span className="ai-dot" /><span>AI 내 업무 요약</span></div>
        <p>AI 채널에서 <b>/스케줄</b>을 입력하면 오늘/이번 주 마감을 정리해 드립니다.</p>
      </div>
    </div>
  );
}
