import { useState, useMemo, useRef, useEffect } from 'react';
import { useTeamTasks, taskDate } from '../../hooks/useTeamTasks';

function getWeekDates() {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function RingChart({ pct, size = 76, stroke = 9, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(Math.max(pct, 0), 1);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} />
    </svg>
  );
}

function Dashboard({ memberTasks, members, today }) {
  const weekDates = useMemo(() => getWeekDates(), []);

  const allTasks = useMemo(() => Object.values(memberTasks).flat(), [memberTasks]);
  const todayTasks = useMemo(() => allTasks.filter((t) => taskDate(t) === today), [allTasks, today]);
  const todayDoneCount = todayTasks.filter((t) => t.done).length;
  const todayRate = todayTasks.length > 0 ? todayDoneCount / todayTasks.length : 0;

  const weekStats = useMemo(() => weekDates.map((date) => {
    const dt = allTasks.filter((t) => taskDate(t) === date);
    return { date, total: dt.length, done: dt.filter((t) => t.done).length };
  }), [allTasks, weekDates]);

  const weekDone = weekStats.reduce((s, d) => s + d.done, 0);
  const weekTotal = weekStats.reduce((s, d) => s + d.total, 0);
  const weekRate = weekTotal > 0 ? weekDone / weekTotal : 0;

  const mvp = useMemo(() => {
    let best = null, bestCount = 0;
    members.forEach((m) => {
      const cnt = (memberTasks[m.uid] || []).filter((t) => taskDate(t) === today && t.done).length;
      if (cnt > bestCount) { bestCount = cnt; best = m; }
    });
    return { member: best, count: bestCount };
  }, [memberTasks, members, today]);

  const maxBar = Math.max(...weekStats.map((d) => d.total), 1);
  const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

  return (
    <div className="tt-dashboard">
      <div className="tt-dash-card">
        <div className="tt-ring-wrap">
          <RingChart pct={todayRate} color="oklch(0.52 0.19 145)" />
          <span className="tt-ring-pct">{Math.round(todayRate * 100)}%</span>
        </div>
        <div className="tt-dash-info">
          <div className="tt-dash-label">오늘 달성률</div>
          <div className="tt-dash-val">{todayDoneCount} / {todayTasks.length} 완료</div>
        </div>
      </div>

      <div className="tt-dash-card">
        <div className="tt-ring-wrap">
          <RingChart pct={weekRate} color="oklch(0.52 0.19 260)" />
          <span className="tt-ring-pct">{Math.round(weekRate * 100)}%</span>
        </div>
        <div className="tt-dash-info">
          <div className="tt-dash-label">주간 달성률</div>
          <div className="tt-dash-val">{weekDone} / {weekTotal} 완료</div>
        </div>
      </div>

      <div className="tt-dash-card tt-bar-card">
        <div className="tt-dash-label">이번 주 현황</div>
        <div className="tt-bar-chart">
          {weekStats.map((d, i) => (
            <div key={d.date} className={'tt-bar-col' + (d.date === today ? ' today' : '')}>
              <div className="tt-bar-slot">
                <div className="tt-bar-total" style={{ height: d.total > 0 ? `${(d.total / maxBar) * 100}%` : '3px' }}>
                  <div className="tt-bar-done-part" style={{ height: d.total > 0 ? `${(d.done / d.total) * 100}%` : '0%' }} />
                </div>
              </div>
              <span className="tt-bar-day">{dayLabels[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tt-dash-card tt-mvp-card">
        <div className="tt-dash-label">오늘의 MVP</div>
        {mvp.member && mvp.count > 0 ? (
          <>
            <div className="tt-mvp-avatar">{(mvp.member.name || '?')[0]}</div>
            <div className="tt-mvp-name">{mvp.member.name}</div>
            <div className="tt-dash-val">{mvp.count}개 완료</div>
          </>
        ) : (
          <div className="tt-dash-empty">아직 없음</div>
        )}
      </div>

      <div className="tt-dash-card">
        <div className="tt-dash-label">전체 태스크</div>
        <div className="tt-dash-bignum">{allTasks.length}</div>
        <div className="tt-dash-sub">미완료 {allTasks.filter((t) => !t.done).length}</div>
      </div>
    </div>
  );
}

function TicketPicker({ tickets, onLink }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const filtered = tickets.filter((t) =>
    t.ticketCode.toLowerCase().includes(q.toLowerCase()) ||
    t.title.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button className="tt-link-btn" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} title="티켓 연결">🔗</button>
      {open && (
        <div className="tt-ticket-picker" onClick={(e) => e.stopPropagation()}>
          <input className="tt-picker-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="티켓 검색…" autoFocus />
          {filtered.length === 0
            ? <div className="tt-picker-empty">없음</div>
            : filtered.map((t) => (
              <button key={t.id} className="tt-picker-item" onClick={() => { onLink(t.id); setOpen(false); setQ(''); }}>
                <span className="tt-picker-code">{t.ticketCode}</span>
                <span className="tt-picker-name">{t.title}</span>
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, tickets = [], onLinkTicket }) {
  const isOverdue = !task.done && taskDate(task) < new Date().toISOString().slice(0, 10);
  // Use saved ticketCode on the task as fallback so sidebar doesn't need the tickets array
  const ticket = tickets.find((t) => t.id === task.ticketId)
    || (task.ticketCode ? { id: task.ticketId, ticketCode: task.ticketCode, title: task.ticketTitle || '' } : null);
  return (
    <div
      className={'tt-task-row' + (task.done ? ' done' : '') + (isOverdue ? ' overdue' : '')}
      onClick={() => onToggle(task.id, !task.done)}
    >
      <span className="tt-check">{task.done ? '✓' : ''}</span>
      <span className="tt-task-title">{task.title}</span>
      {isOverdue && <span className="tt-overdue-tag">지연</span>}
      {ticket ? (
        <span
          className="tt-ticket-badge"
          title={ticket.title}
          onClick={(e) => { e.stopPropagation(); onLinkTicket(task.id, null); }}
        >
          {ticket.ticketCode} ✕
        </span>
      ) : tickets.length > 0 && (
        <TicketPicker tickets={tickets} onLink={(ticketId) => onLinkTicket(task.id, ticketId)} />
      )}
    </div>
  );
}

function MemberColumn({ member, tasks, onToggle, onUpdateTask, tickets, projectId, today }) {
  const [showHistory, setShowHistory] = useState(false);

  const todayTasks = useMemo(() => tasks.filter((t) => taskDate(t) === today), [tasks, today]);
  const overdueTasks = useMemo(() => tasks.filter((t) => !t.done && taskDate(t) < today), [tasks, today]);
  const todayDone = todayTasks.filter((t) => t.done).length;
  const todayTotal = todayTasks.length;
  const pct = todayTotal > 0 ? todayDone / todayTotal : 0;

  const historyByDate = useMemo(() => {
    const past = tasks.filter((t) => taskDate(t) < today);
    const groups = {};
    past.forEach((t) => {
      const d = taskDate(t);
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [tasks]);

  return (
    <div className="tt-member-col">
      <div className="tt-member-hd">
        <div className="tt-member-avatar">{(member.name || '?')[0].toUpperCase()}</div>
        <div className="tt-member-meta">
          <div className="tt-member-name">{member.name}</div>
          <div className="tt-member-role">{member.role === 'lead' ? '팀장' : '팀원'}</div>
        </div>
        <div className="tt-member-pct">{Math.round(pct * 100)}%</div>
      </div>

      <div className="tt-progress-track">
        <div className="tt-progress-fill" style={{ width: `${pct * 100}%` }} />
      </div>

      <div className="tt-sec-label">오늘 {todayDone}/{todayTotal}</div>
      <div className="tt-task-list">
        {todayTasks.length === 0
          ? <div className="tt-empty">오늘 태스크 없음</div>
          : todayTasks.map((t) => (
            <TaskRow key={t.id} task={t} tickets={tickets}
              onToggle={(id, done) => {
                const task = tasks.find((tk) => tk.id === id);
                onToggle(member.uid, id, done, { ...task, memberName: member.name });
              }}
              onLinkTicket={(taskId, ticketId) => {
                const lk = tickets.find((tk) => tk.id === ticketId);
                onUpdateTask(taskId, ticketId
                  ? { ticketId, ticketCode: lk?.ticketCode || null, ticketTitle: lk?.title || null, ticketProjectId: projectId }
                  : { ticketId: null, ticketCode: null, ticketTitle: null, ticketProjectId: null });
              }} />
          ))
        }
      </div>

      {overdueTasks.length > 0 && (
        <>
          <div className="tt-sec-label overdue">지연 {overdueTasks.length}건</div>
          <div className="tt-task-list">
            {overdueTasks.map((t) => (
              <TaskRow key={t.id} task={t} tickets={tickets}
                onToggle={(id, done) => {
                  const task = tasks.find((tk) => tk.id === id);
                  onToggle(member.uid, id, done, { ...task, memberName: member.name });
                }}
                onLinkTicket={(taskId, ticketId) => {
                  const lk = tickets.find((tk) => tk.id === ticketId);
                  onUpdateTask(taskId, ticketId
                    ? { ticketId, ticketCode: lk?.ticketCode || null, ticketTitle: lk?.title || null, ticketProjectId: projectId }
                    : { ticketId: null, ticketCode: null, ticketTitle: null, ticketProjectId: null });
                }} />
            ))}
          </div>
        </>
      )}

      <button className="tt-hist-toggle" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? '▲' : '▼'} 히스토리{historyByDate.length > 0 ? ` (${historyByDate.length}일)` : ''}
      </button>

      {showHistory && (
        <div className="tt-history">
          {historyByDate.length === 0
            ? <div className="tt-empty">기록 없음</div>
            : historyByDate.map(([date, items]) => (
              <div key={date} className="tt-hist-group">
                <div className="tt-hist-date">{date}</div>
                {items.map((t) => (
                  <div key={t.id} className={'tt-hist-item' + (t.done ? ' done' : '')}>
                    <span className="tt-check-sm">{t.done ? '✓' : '○'}</span>
                    <span>{t.title}</span>
                  </div>
                ))}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

export default function TasksTab({ projectId, project, tickets = [] }) {
  const members = useMemo(() => (project?.members || []).filter((m) => m.uid), [project]);
  const { memberTasks, toggleTask, updateTask } = useTeamTasks(members);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="tt-root">
      <Dashboard memberTasks={memberTasks} members={members} today={today} />
      <div className="tt-columns">
        {members.length === 0 ? (
          <div className="tt-no-members">
            <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>멤버가 없습니다</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>멤버관리에서 팀원을 추가하세요.</div>
          </div>
        ) : (
          members.map((m) => (
            <MemberColumn
              key={m.uid}
              member={m}
              tasks={memberTasks[m.uid] || []}
              onToggle={toggleTask}
              onUpdateTask={(taskId, fields) => updateTask(m.uid, taskId, fields)}
              tickets={tickets}
              projectId={projectId}
              today={today}
            />
          ))
        )}
      </div>
    </div>
  );
}
