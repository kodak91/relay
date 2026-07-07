import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import useAppStore from '../../store/appStore';
import { useProjects } from '../../hooks/useProjects';
import { useGlobalMessages } from '../../hooks/useGlobalMessages';
import { usePersonalTasks, taskDate, todayStr } from '../../hooks/usePersonalTasks';
import { useTickets } from '../../hooks/useTickets';

const TYPE_LABELS = {
  approval: '컨펌', decision: '결정', vote: '투표',
  update: '보고', announce: '공지', meeting: '회의',
};

export default function RightSidebar({ onJumpToMessage, mobilePanel, onMobilePanelClose }) {
  const { activeProject, user } = useAppStore();
  const { projects } = useProjects();
  const [tab, setTab] = useState('confirm');

  useEffect(() => {
    if (user?.role === 'member') setTab('tasks');
    else setTab('confirm');
  }, [user?.role]);

  const activeProjects = (projects || []).filter((p) => p.status !== '보관' && p.status !== '삭제됨');
  const { messages } = useGlobalMessages(activeProjects);
  const taskState = usePersonalTasks(user?.uid);
  const { tasks } = taskState;

  // Ghost-safe filters: require minimum content so incomplete Firestore docs are excluded
  const pendingApprovals = messages.filter(
    (m) => m.type === 'approval' && m.text && (!m.status || m.status === 'pending')
  );
  const heldApprovals = messages.filter(
    (m) => m.type === 'approval' && m.text && m.status === 'held'
  );
  const pendingDecisions = messages.filter(
    (m) => m.type === 'decision' && !m.chosen && (m.title || m.options?.length > 0)
  );
  const pendingAll = [
    ...pendingApprovals.map((m) => ({ ...m, tag: '승인', kind: 'approval' })),
    ...pendingDecisions.map((m) => ({ ...m, tag: '결정', kind: 'decision' })),
  ];

  // Catchup: show (1) items needing MY action, (2) my requests that have been acted on
  const catchupMessages = useMemo(() => messages.filter((m) => {
    const isDecider = m.targetUid === user?.uid || (!m.targetUid && user?.role === 'lead');
    const isAuthor = m.senderUid === user?.uid;

    if (m.type === 'approval') {
      if (isDecider && !isAuthor) return !m.status || m.status === 'pending';
      if (isDecider && isAuthor) return !m.status || m.status === 'pending';
      if (isAuthor) return m.status === 'approved' || m.status === 'done' || m.status === 'held';
      return false;
    }
    if (m.type === 'decision') {
      if (isDecider && !isAuthor) return !m.chosen;
      if (isDecider && isAuthor) return !m.chosen;
      if (isAuthor) return !!m.chosen;
      return false;
    }
    if (m.type === 'vote') {
      const hasVoted = (m.options || []).some((o) =>
        (o.votes || []).some((v) => v.uid === user?.uid)
      );
      return !hasVoted;
    }
    return true;
  }), [messages, user?.uid, user?.role]);

  const myTasks = tasks.filter((t) => !t.done);
  const isLead = user?.role === 'lead';

  // Held approval auto-reactivation: when heldUntil date passes, revert to pending
  const reactivatedRef = useRef(new Set());
  useEffect(() => {
    if (!heldApprovals.length) return;
    const today = new Date().toISOString().slice(0, 10);
    heldApprovals.forEach(async (m) => {
      if (!m.heldUntil || m.heldUntil > today) return;
      if (reactivatedRef.current.has(m.id)) return;
      reactivatedRef.current.add(m.id);
      try {
        await updateDoc(doc(db, 'projects', m.projectId, 'messages', m.id), {
          status: 'pending', heldUntil: null,
        });
        const notify = async (uid, title) => {
          if (!uid) return;
          await addDoc(collection(db, 'notifications', uid, 'items'), {
            type: 'approval_reactivated', title,
            body: m.text?.slice(0, 60) || '',
            fromName: 'Relay', read: false, createdAt: serverTimestamp(),
          }).catch(() => {});
        };
        await notify(m.targetUid, '보류된 컨펌이 다시 승인 대기 중입니다');
        if (m.senderUid && m.senderUid !== m.targetUid) {
          await notify(m.senderUid, '보류된 컨펌이 다시 처리 대기 중입니다');
        }
      } catch (e) {
        reactivatedRef.current.delete(m.id);
        console.warn('Hold reactivate:', e.message);
      }
    });
  }, [heldApprovals]);

  // Dismissed state lifted here so badge reflects visible count
  const confirmStorageKey = `confirm_dismissed_${user?.uid || 'anon'}`;
  const [dismissed, setDismissed] = useState(new Set());
  useEffect(() => {
    try { setDismissed(new Set(JSON.parse(localStorage.getItem(confirmStorageKey) || '[]'))); }
    catch { setDismissed(new Set()); }
  }, [confirmStorageKey]);

  const dismiss = useCallback((id) => {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(confirmStorageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [confirmStorageKey]);

  const resetAllDismissed = useCallback(() => {
    const allIds = [...pendingAll.map((i) => i.id), ...heldApprovals.map((i) => i.id)];
    setDismissed((prev) => {
      const next = new Set([...prev, ...allIds]);
      try { localStorage.setItem(confirmStorageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [confirmStorageKey, pendingAll, heldApprovals]);

  const visiblePendingCount = pendingAll.filter((i) => !dismissed.has(i.id)).length;
  const visibleHeldCount = heldApprovals.filter((i) => !dismissed.has(i.id)).length;

  // --- Notification logic (always active, tab-independent) ---
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const catchupSeenIds = useRef(null);
  const sessionStart = useRef(Date.now());

  const requestNotif = async (e) => {
    e?.stopPropagation();
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  // Browser notifications for catchup messages (approval/decision/vote/etc.)
  useEffect(() => {
    if (notifPerm !== 'granted') return;
    if (catchupSeenIds.current === null) {
      catchupSeenIds.current = new Set(catchupMessages.map((m) => m.id));
      return;
    }
    catchupMessages.forEach((m) => {
      if (catchupSeenIds.current.has(m.id)) return;
      const msgMs = m.createdAt?.toMillis?.() ?? (m.createdAt?.seconds ?? 0) * 1000;
      if (msgMs > sessionStart.current) {
        new Notification('Relay — 따라잡기', {
          body: `${TYPE_LABELS[m.type] || m.type}: ${m.title || m.text?.slice(0, 60) || '(내용 없음)'}`,
          icon: '/favicon.ico',
        });
      }
    });
    catchupSeenIds.current = new Set(catchupMessages.map((m) => m.id));
  }, [catchupMessages, notifPerm]);

  // Browser notifications for task-assignment (notifications/{uid}/items)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'notifications', user.uid, 'items'),
      orderBy('createdAt', 'desc')
    );
    let initialized = false;
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          if (!initialized) return;
          if (Notification.permission === 'granted') {
            const data = change.doc.data();
            new Notification('Relay — ' + (data.title || '새 알림'), {
              body: data.body || '',
              icon: '/favicon.ico',
            });
          }
        }
      });
      initialized = true;
    });
    return unsub;
  }, [user?.uid]);

  const POSITION_COLORS = {
    '대표': 'oklch(0.38 0.18 270)',
    '부장': 'oklch(0.45 0.16 270)',
    '팀장': 'oklch(0.48 0.21 270)',
    '대리': 'oklch(0.52 0.12 160)',
    '사원': 'oklch(0.55 0.10 80)',
  };
  const posColor = POSITION_COLORS[user?.position] || 'var(--ink-3)';

  return (
    <aside className={'col-right' + (mobilePanel ? ' mob-panel' : '')}>
      <div className="mob-panel-hd">
        <span style={{ fontWeight: 700, fontSize: 14 }}>업무 현황</span>
        <button className="mob-panel-close" onClick={onMobilePanelClose}>✕</button>
      </div>
      <div className="position-bar">
        <span className="position-badge" style={{ background: posColor }}>
          {user?.position || '—'}
        </span>
        <span className="position-name">{user?.name}</span>
      </div>

      <div className="right-tabs">
        <button className={'right-tab' + (tab === 'confirm' ? ' on' : '')} onClick={() => setTab('confirm')}>
          컨펌 대기
          <span className="cnt">{visiblePendingCount + visibleHeldCount}</span>
        </button>
        <button className={'right-tab' + (tab === 'tasks' ? ' on' : '')} onClick={() => setTab('tasks')}>
          내 태스크
          <span className="cnt">{myTasks.length}</span>
        </button>
      </div>

      {tab === 'confirm'
        ? <ConfirmSidebar pending={pendingAll} held={heldApprovals} catchup={catchupMessages} onJump={onJumpToMessage} isLead={isLead} uid={user?.uid} notifPerm={notifPerm} onRequestNotif={requestNotif} dismissed={dismissed} onDismiss={dismiss} onResetAll={resetAllDismissed} />
        : <TaskSidebar uid={user?.uid} activeProject={activeProject} taskState={taskState} />
      }
    </aside>
  );
}

function CatchupSection({ messages, onJump, uid, notifPerm, onRequestNotif }) {
  const storageKey = `catchup_dismissed_${uid || 'anon'}`;
  const [dismissed, setDismissed] = useState(new Set());

  // Reload dismissed set whenever uid (and thus storageKey) becomes available
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setDismissed(new Set(stored));
    } catch {
      setDismissed(new Set());
    }
  }, [storageKey]);

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const dismissAll = () => {
    const allIds = messages.map((m) => m.id);
    const next = new Set([...dismissed, ...allIds]);
    setDismissed(next);
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
  };

  const visible = useMemo(
    () => messages.filter((m) => !dismissed.has(m.id)),
    [messages, dismissed]
  );

  return (
    <div className="r-section">
      <div className="r-hd">
        <h4>⚡ 따라잡기</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {notifPerm !== 'granted' && typeof Notification !== 'undefined' && (
            <button className="catchup-notif-btn" onClick={onRequestNotif} title="알림 허용">🔔 알림</button>
          )}
          {visible.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); dismissAll(); }}
              style={{ fontSize: 10, color: 'var(--ink-mute)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
            >전체 무시</button>
          )}
          <span className="cnt">{visible.length}건</span>
        </div>
      </div>
      {(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visible.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '10px 0' }}>모두 확인했습니다 ✓</p>
          )}
          {visible.map((m) => {
            const isDecider = m.targetUid === uid || (!m.targetUid);
            const isResolved =
              (m.type === 'approval' && (m.status === 'approved' || m.status === 'done' || m.status === 'held')) ||
              (m.type === 'decision' && !!m.chosen);
            const tagLabel = isResolved
              ? (m.type === 'approval'
                  ? (m.status === 'approved' ? '컨펌 완료' : m.status === 'done' ? '반려됨' : '보류됨')
                  : `${m.chosen}안 결정`)
              : (TYPE_LABELS[m.type] || m.type);
            return (
              <div key={m.id} className="catchup-item">
                <label className="catchup-check">
                  <input type="checkbox" onChange={() => dismiss(m.id)} />
                </label>
                <div className="catchup-body" onClick={() => onJump && onJump(m.id)}>
                  <span className="catchup-tag" style={isResolved ? { background: 'var(--emerald-bg)', color: 'var(--emerald)', borderColor: 'var(--emerald-line)' } : {}}>
                    {tagLabel}
                  </span>
                  {m.projectName && <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{m.projectName}</span>}
                  <span className="catchup-text">{m.title || m.text?.slice(0, 36) || '(내용 없음)'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmSidebar({ pending, held, catchup, onJump, isLead, uid, notifPerm, onRequestNotif, dismissed, onDismiss, onResetAll }) {
  const visiblePending = pending.filter((item) => !dismissed.has(item.id));
  const visibleHeld = held.filter((item) => !dismissed.has(item.id));

  return (
    <div className="right-body">
      <CatchupSection messages={catchup} onJump={onJump} uid={uid} notifPerm={notifPerm} onRequestNotif={onRequestNotif} />

      <div className="r-section">
        <div className="r-hd">
          <h4>결정·승인 대기</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="cnt">{visiblePending.length}건</span>
            {(visiblePending.length > 0 || visibleHeld.length > 0) && (
              <button
                onClick={onResetAll}
                style={{ fontSize: 10, color: 'var(--ink-mute)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
                title="모두 무시"
              >초기화</button>
            )}
          </div>
        </div>
        {visiblePending.length === 0 && visibleHeld.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', padding: '16px 0' }}>
            대기 중인 항목이 없습니다 ✓
          </p>
        )}
        {visiblePending.map((item) => (
          <div key={item.id} className={'r-card ' + item.kind} style={{ position: 'relative' }}>
            <button
              onClick={() => onDismiss(item.id)}
              style={{ position: 'absolute', top: 4, right: 4, border: 0, background: 'none', color: 'var(--ink-mute)', fontSize: 13, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', opacity: 0.5 }}
              title="무시"
            >×</button>
            <div onClick={() => onJump && onJump(item.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                <div className="r-tag">{item.tag}</div>
                {item.projectName && <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{item.projectName}</span>}
              </div>
              <div className="r-ttl">{item.title || item.text?.slice(0, 50)}</div>
              <div className="r-foot">
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.ts}</span>
                <div className="actions">
                  {(item.targetUid === uid || (!item.targetUid && isLead))
                    ? <button>{item.kind === 'approval' ? '결정하기 →' : '선택하기 →'}</button>
                    : <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>검토 대기 중</span>
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {visibleHeld.length > 0 && (
        <div className="r-section">
          <div className="r-hd">
            <h4>⏸ 보류 중</h4>
            <span className="cnt">{visibleHeld.length}건</span>
          </div>
          {visibleHeld.map((item) => (
            <div key={item.id} className="r-card held" style={{ position: 'relative' }}>
              <button
                onClick={() => onDismiss(item.id)}
                style={{ position: 'absolute', top: 4, right: 4, border: 0, background: 'none', color: 'var(--ink-mute)', fontSize: 13, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', opacity: 0.5 }}
                title="무시"
              >×</button>
              <div onClick={() => onJump && onJump(item.id)} style={{ cursor: 'pointer' }}>
                <div className="r-tag" style={{ color: 'oklch(0.42 0.13 70)' }}>보류</div>
                <div className="r-ttl">{item.text?.slice(0, 50)}</div>
                {item.heldUntil && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>📅 {item.heldUntil}까지</div>}
              </div>
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

function SidebarTicketPicker({ tickets, onLink }) {
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
    t.ticketCode?.toLowerCase().includes(q.toLowerCase()) ||
    t.title?.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button className="tt-link-btn" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} title="티켓 연결">🔗</button>
      {open && (
        <div className="tt-ticket-picker" style={{ right: 0, left: 'auto' }} onClick={(e) => e.stopPropagation()}>
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

function PersonalTaskRow({ task, tickets, activeProjectId, onToggle, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(task.detail || '');
  const detailRef = useRef(null);
  const ticket = task.ticketCode
    ? { ticketCode: task.ticketCode, title: task.ticketTitle || '' }
    : null;

  useEffect(() => {
    if (!expanded || !detailRef.current) return;
    detailRef.current.style.height = 'auto';
    detailRef.current.style.height = `${detailRef.current.scrollHeight}px`;
  }, [detail, expanded]);

  const saveDetail = () => {
    if (detail !== (task.detail || '')) onUpdate(task.id, { detail });
  };

  return (
    <div>
      <div className={'task-row' + (task.done ? ' done' : '')} style={{ cursor: 'default' }}>
        <div
          className={'task-check' + (task.done ? ' done-check' : '')}
          onClick={() => onToggle(task.id, !task.done)}
          style={{ cursor: 'pointer', flexShrink: 0 }}
        />
        <span
          className="task-text"
          style={{ flex: 1, cursor: 'pointer' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {task.title}
        </span>
        {ticket ? (
          <span
            className={'task-ticket-badge' + (task.done ? ' done' : '')}
            title={ticket.title || ticket.ticketCode}
            onClick={(e) => { e.stopPropagation(); onUpdate(task.id, { ticketId: null, ticketCode: null, ticketTitle: null, ticketProjectId: null }); }}
            style={{ cursor: 'pointer' }}
          >
            {ticket.ticketCode} ✕
          </span>
        ) : tickets.length > 0 && (
          <SidebarTicketPicker
            tickets={tickets}
            onLink={(ticketId) => {
              const t = tickets.find((tk) => tk.id === ticketId);
              onUpdate(task.id, {
                ticketId,
                ticketCode: t?.ticketCode || null,
                ticketTitle: t?.title || null,
                ticketProjectId: activeProjectId,
              });
            }}
          />
        )}
        {task.date && !task.done && <span className="task-date">{task.date.slice(5)}</span>}
        {task.assignedBy && <span className="task-assigned">by {task.assignedBy}</span>}
        <button
          style={{ border: 0, background: 'transparent', color: 'var(--ink-mute)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        >×</button>
      </div>
      {expanded && (
        <textarea
          ref={detailRef}
          value={detail}
          onChange={(e) => {
            setDetail(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={saveDetail}
          placeholder="세부 내용 입력…"
          rows={1}
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 2, marginBottom: 4,
            padding: '5px 8px', fontSize: 12, background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
            outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'var(--font-sans)',
            color: 'var(--ink-2)', lineHeight: 1.5,
          }}
        />
      )}
    </div>
  );
}

function TaskSidebar({ uid, activeProject, taskState }) {
  const { tasks, todayTasks, overdueTasks, weekStats, error, addTask, toggleTask, updateTask, deleteTask, deleteAllTasks } = taskState;
  const { tickets } = useTickets(activeProject);
  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const today = new Date();
  const currentDay = todayStr();
  const todayLabel = today.toLocaleDateString('ko', { month: 'numeric', day: 'numeric', weekday: 'short' });

  const handleAdd = async () => {
    if (!newTitle.trim() || !uid || adding) return;
    setAdding(true);
    setAddError('');
    try {
      await addTask(newTitle.trim());
      setNewTitle('');
    } catch (e) {
      setAddError(e?.message || '태스크를 추가하지 못했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const todayOpenTasks = todayTasks.filter((t) => !t.done);
  const upcomingTasks = tasks.filter((t) => !t.done && taskDate(t) > currentDay);
  const activeTasks = [...overdueTasks, ...todayOpenTasks, ...upcomingTasks];
  const doneTodayTasks = todayTasks.filter((t) => t.done);

  return (
    <div className="right-body">
      {/* Weekly summary */}
      <div className="r-section">
        <div className="r-hd"><h4>📊 이번 주 현황</h4></div>
        <div className="week-grid">
          {weekStats.map((ws, i) => (
            <div key={ws.date} className={'week-day' + (ws.date === currentDay ? ' today' : '')}>
              <div className="wd-label">{WEEK_DAYS[i]}</div>
              <div className="wd-done">{ws.done}</div>
              <div className="wd-sep">—</div>
              <div className="wd-total">{ws.total || 0}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>완료 — 전체</div>
      </div>

      {/* Daily tasks */}
      <div className="r-section">
        <div className="r-hd">
          <h4>📋 오늘 업무
            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-mute)', marginLeft: 6 }}>{todayLabel}</span>
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="cnt">{activeTasks.length}건 남음</span>
            {tasks.length > 0 && (
              <button
                onClick={() => { if (window.confirm(`내 태스크 ${tasks.length}건을 Firebase에서 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) deleteAllTasks(); }}
                style={{ fontSize: 10, color: 'var(--ink-mute)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
              >전체 삭제</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '5px 8px', fontSize: 12, background: 'var(--surface)', outline: 'none' }}
            placeholder="+ 할 일 추가…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn accent sm" onClick={handleAdd} disabled={!uid || !newTitle.trim() || adding}>추가</button>
        </div>
        {(error || addError) && (
          <div style={{ fontSize: 11, color: 'var(--rose)', margin: '-2px 0 8px', lineHeight: 1.4 }}>
            {error || addError}
          </div>
        )}

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
          <PersonalTaskRow key={t.id} task={t} tickets={tickets} activeProjectId={activeProject}
            onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
        ))}

        {/* Today's incomplete */}
        {todayOpenTasks.map((t) => (
          <PersonalTaskRow key={t.id} task={t} tickets={tickets} activeProjectId={activeProject}
            onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
        ))}

        {upcomingTasks.length > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', margin: '8px 0 4px', letterSpacing: '0.03em' }}>
            예정 {upcomingTasks.length}건
          </div>
        )}
        {upcomingTasks.map((t) => (
          <PersonalTaskRow key={t.id} task={t} tickets={tickets} activeProjectId={activeProject}
            onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
        ))}

        {/* Completed today */}
        {doneTodayTasks.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--emerald)', margin: '8px 0 4px', letterSpacing: '0.03em' }}>
              완료 {doneTodayTasks.length}건
            </div>
            {doneTodayTasks.map((t) => (
              <PersonalTaskRow key={t.id} task={t} tickets={tickets} activeProjectId={activeProject}
                onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
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
