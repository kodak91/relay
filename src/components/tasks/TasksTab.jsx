import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

function fmtYearMonth(ym) {
  const [y, m] = ym.split('-');
  return `${y}년 ${parseInt(m)}월`;
}

function fmtDateLabel(date) {
  const d = new Date(date + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getDate()}일 (${days[d.getDay()]})`;
}
import { useTeamTasks, taskDate, taskCompletedDate, formatTaskDate, PROJECT_TASK_UID } from '../../hooks/useTeamTasks';

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
  // 오늘 달성률 = 오늘 완료 / (오늘 완료 + 오늘까지 마감이지만 미완료)
  const doneToday = useMemo(() => allTasks.filter((t) => t.done && taskCompletedDate(t) === today), [allTasks, today]);
  const openDueToday = useMemo(() => allTasks.filter((t) => !t.done && taskDate(t) <= today), [allTasks, today]);
  const todayDoneCount = doneToday.length;
  const todayRelevant = doneToday.length + openDueToday.length;
  const todayRate = todayRelevant > 0 ? todayDoneCount / todayRelevant : 0;

  // 주간: 완료는 완료일 기준, 미완료는 마감일 기준으로 각 날짜에 집계
  const weekStats = useMemo(() => weekDates.map((date) => {
    const doneOn = allTasks.filter((t) => t.done && taskCompletedDate(t) === date).length;
    const openDue = allTasks.filter((t) => !t.done && taskDate(t) === date).length;
    return { date, total: doneOn + openDue, done: doneOn };
  }), [allTasks, weekDates]);

  const weekDone = weekStats.reduce((s, d) => s + d.done, 0);
  const weekTotal = weekStats.reduce((s, d) => s + d.total, 0);
  const weekRate = weekTotal > 0 ? weekDone / weekTotal : 0;

  // 오늘의 MVP = 오늘 완료한 태스크가 가장 많은 멤버
  const mvp = useMemo(() => {
    let best = null, bestCount = 0;
    members.forEach((m) => {
      const cnt = (memberTasks[m.uid] || []).filter((t) => t.done && taskCompletedDate(t) === today).length;
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
          <div className="tt-dash-val">{todayDoneCount} / {todayRelevant} 완료</div>
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

function TaskRow({ task, onToggle, tickets = [], onLinkTicket, onUpdateDetail }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(task.detail || '');
  const [editingDate, setEditingDate] = useState(false);
  const detailRef = useRef(null);
  const curDate = taskDate(task);
  const isOverdue = !task.done && curDate < new Date().toISOString().slice(0, 10);
  const ticket = tickets.find((t) => t.id === task.ticketId)
    || (task.ticketCode ? { id: task.ticketId, ticketCode: task.ticketCode, title: task.ticketTitle || '' } : null);

  const saveDetail = () => {
    if (detail !== (task.detail || '')) onUpdateDetail?.(task.id, { detail });
  };

  // 날짜(마감일) 편집 — 날짜 클릭 → date input, 선택 즉시 저장
  const changeDate = (newDate) => {
    setEditingDate(false);
    if (newDate && newDate !== curDate) onUpdateDetail?.(task.id, { date: newDate });
  };
  const dateLabel = curDate?.slice(5).replace('-', '/') || '날짜';

  useEffect(() => {
    if (!expanded || !detailRef.current) return;
    detailRef.current.style.height = 'auto';
    detailRef.current.style.height = `${detailRef.current.scrollHeight}px`;
  }, [detail, expanded]);

  return (
    <div>
      <div className={'tt-task-row' + (task.done ? ' done' : '') + (isOverdue ? ' overdue' : '')} style={{ cursor: 'default' }}>
        <span
          className="tt-check"
          style={{ cursor: 'pointer' }}
          onClick={() => onToggle(task.id, !task.done)}
        >
          {task.done ? '✓' : ''}
        </span>
        <span
          className="tt-task-title"
          style={{ cursor: 'pointer' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {task.title}
        </span>
        {isOverdue && <span className="tt-overdue-tag">지연</span>}
        {editingDate ? (
          <input
            type="date"
            className="tt-date-edit"
            defaultValue={curDate}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => changeDate(e.target.value)}
            onBlur={() => setEditingDate(false)}
          />
        ) : (
          <span
            className="tt-date-pill"
            title="클릭해서 마감일 변경"
            onClick={(e) => { e.stopPropagation(); setEditingDate(true); }}
          >
            📅 {dateLabel}
          </span>
        )}
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
      {expanded && (
        <textarea
          ref={detailRef}
          className="tt-task-detail"
          value={detail}
          onChange={(e) => {
            setDetail(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={saveDetail}
          placeholder="세부 내용 입력…"
          onClick={(e) => e.stopPropagation()}
          rows={1}
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 2, marginBottom: 4,
            padding: '6px 10px', fontSize: 12, background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
            outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'var(--font-sans)',
            color: 'var(--ink-2)', lineHeight: 1.5,
          }}
        />
      )}
    </div>
  );
}

function TaskAddBar({ members, onAdd, today }) {
  const [title, setTitle] = useState('');
  const [assigneeUid, setAssigneeUid] = useState(members[0]?.uid || '');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const valid = new Set(members.map((m) => m.uid));
    if (!valid.has(assigneeUid)) setAssigneeUid(members[0]?.uid || '');
  }, [members, assigneeUid]);

  const handleAdd = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || saving) return;
    const member = members.find((m) => m.uid === assigneeUid);
    setSaving(true);
    setError('');
    try {
      await onAdd({
        title: cleanTitle,
        assigneeUid,
        assigneeName: member?.name || '',
        date,
      });
      setTitle('');
    } catch (e) {
      setError(e?.message || '태스크를 추가하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tt-addbar">
      <input
        className="tt-add-input"
        placeholder="+ 할 일 추가"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <select
        className="tt-add-select"
        value={assigneeUid}
        onChange={(e) => setAssigneeUid(e.target.value)}
        title="담당자"
      >
        {members.map((m) => (
          <option key={m.uid} value={m.uid}>{m.name}</option>
        ))}
      </select>
      <input
        className="tt-add-date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        title="일자"
      />
      <button className="btn accent sm" onClick={handleAdd} disabled={!title.trim() || saving}>
        추가
      </button>
      {error && <span className="tt-add-error">{error}</span>}
    </div>
  );
}

function MemberColumn({ member, tasks, onToggle, onUpdateTask, tickets, projectId, today }) {
  const [showHistory, setShowHistory] = useState(false);
  const [openDates, setOpenDates] = useState(new Set());
  const toggleDate = useCallback((date) => {
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }, []);

  // 마감일(deadline) 모델:
  // - 진행 중: 미완료 && 마감일 >= 오늘 (오늘부터 마감일까지 매일 노출)
  // - 지연: 미완료 && 마감일 < 오늘
  // - 완료: 완료한 날짜(completedDate) 기준 배치 (오늘 완료 / 과거는 히스토리)
  const activeTasks = useMemo(() => tasks.filter((t) => !t.done && taskDate(t) >= today), [tasks, today]);
  const overdueTasks = useMemo(() => tasks.filter((t) => !t.done && taskDate(t) < today), [tasks, today]);
  const completedToday = useMemo(() => tasks.filter((t) => t.done && taskCompletedDate(t) === today), [tasks, today]);
  // "오늘" 리스트 = 진행 중(미완료) + 오늘 완료
  const todayTasks = useMemo(() => [...activeTasks, ...completedToday], [activeTasks, completedToday]);
  const todayDone = completedToday.length;
  const todayTotal = todayTasks.length;
  const pct = todayTotal > 0 ? todayDone / todayTotal : 0;

  // 히스토리 = 완료 태스크 중 완료일이 과거인 것 → 완료일 기준 그룹
  const historyByDate = useMemo(() => {
    const past = tasks.filter((t) => t.done && taskCompletedDate(t) < today);
    const groups = {};
    past.forEach((t) => {
      const d = taskCompletedDate(t);
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [tasks, today]);

  const historyByYearMonth = useMemo(() => {
    const groups = {};
    historyByDate.forEach(([date, items]) => {
      const ym = date.slice(0, 7);
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push([date, items]);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [historyByDate]);

  return (
    <div className="tt-member-col">
      <div className="tt-member-hd">
        <div className="tt-member-avatar">{(member.name || '?')[0].toUpperCase()}</div>
        <div className="tt-member-meta">
          <div className="tt-member-name">{member.name}</div>
          <div className="tt-member-role">{member.uid === PROJECT_TASK_UID ? '공용 태스크' : member.role === 'lead' ? '팀장' : '팀원'}</div>
        </div>
        <div className="tt-member-pct">{Math.round(pct * 100)}%</div>
      </div>

      <div className="tt-progress-track">
        <div className="tt-progress-fill" style={{ width: `${pct * 100}%` }} />
      </div>

      <div className="tt-sec-label">진행 중 {todayDone}/{todayTotal}</div>
      <div className="tt-task-list">
        {todayTasks.length === 0
          ? <div className="tt-empty">진행 중인 태스크 없음</div>
          : todayTasks.map((t) => (
            <TaskRow key={t.id} task={t} tickets={tickets}
              onToggle={(id, done) => {
                const task = tasks.find((tk) => tk.id === id);
                onToggle(member.uid, id, done, { ...task, memberName: member.name });
              }}
              onLinkTicket={(taskId, ticketId) => {
                const lk = tickets.find((tk) => tk.id === ticketId);
                const task = tasks.find((tk) => tk.id === taskId);
                onUpdateTask(taskId, ticketId
                  ? { ticketId, ticketCode: lk?.ticketCode || null, ticketTitle: lk?.title || null, ticketProjectId: projectId }
                  : { ticketId: null, ticketCode: null, ticketTitle: null, ticketProjectId: null }, task);
              }}
              onUpdateDetail={(taskId, fields) => {
                const task = tasks.find((tk) => tk.id === taskId);
                onUpdateTask(taskId, fields, task);
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
                  const task = tasks.find((tk) => tk.id === taskId);
                  onUpdateTask(taskId, ticketId
                    ? { ticketId, ticketCode: lk?.ticketCode || null, ticketTitle: lk?.title || null, ticketProjectId: projectId }
                    : { ticketId: null, ticketCode: null, ticketTitle: null, ticketProjectId: null }, task);
                }}
                onUpdateDetail={(taskId, fields) => {
                  const task = tasks.find((tk) => tk.id === taskId);
                  onUpdateTask(taskId, fields, task);
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
          {historyByYearMonth.length === 0
            ? <div className="tt-empty">기록 없음</div>
            : historyByYearMonth.map(([ym, dateGroups]) => (
              <div key={ym} className="tt-hist-ym-group">
                <div className="tt-hist-ym-label">{fmtYearMonth(ym)}</div>
                {dateGroups.map(([date, items]) => (
                  <div key={date} className="tt-hist-date-group">
                    <div
                      className={'tt-hist-date-toggle' + (openDates.has(date) ? ' open' : '')}
                      onClick={() => toggleDate(date)}
                    >
                      <span>{fmtDateLabel(date)}</span>
                      <span className="tt-hist-date-count">{items.filter((t) => t.done).length}/{items.length}</span>
                    </div>
                    {openDates.has(date) && (
                      <div className="tt-hist-date-items">
                        {items.map((t) => (
                          <div key={t.id} className={'tt-hist-item' + (t.done ? ' done' : '')}>
                            <span className="tt-check-sm">{t.done ? '✓' : '○'}</span>
                            <div className="tt-hist-item-body">
                              <span className="tt-hist-item-title">{t.title}</span>
                              {t.detail && <div className="tt-hist-detail">{t.detail}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
  const { memberTasks, toggleTask, updateTask, addTask } = useTeamTasks(members, projectId);
  const today = useMemo(() => formatTaskDate(), []);
  const visibleMembers = useMemo(() => [...members], [members]);

  return (
    <div className="tt-root">
      <Dashboard memberTasks={memberTasks} members={members} today={today} />
      <TaskAddBar members={members} onAdd={addTask} today={today} />
      <div className="tt-columns">
        {visibleMembers.length === 0 ? (
          <div className="tt-no-members">
            <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>멤버가 없습니다</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>멤버관리에서 팀원을 추가하세요.</div>
          </div>
        ) : (
          visibleMembers.map((m) => (
            <MemberColumn
              key={m.uid}
              member={m}
              tasks={memberTasks[m.uid] || []}
              onToggle={toggleTask}
              onUpdateTask={(taskId, fields, task) => updateTask(m.uid, taskId, fields, task)}
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
