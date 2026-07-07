import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const NODE_W = 230;
const NODE_H = 92;
const H_GAP = 60;
const V_GAP = 80;

const STATUS_INFO = {
  '열림':   { color: 'oklch(0.52 0.19 260)' },
  '진행중': { color: 'oklch(0.52 0.19 145)' },
  '완료':   { color: 'oklch(0.52 0.16 195)' },
  '닫힘':   { color: 'var(--ink-3)' },
};

const PRIORITY_INFO = {
  '긴급': { color: 'oklch(0.52 0.18 25)',  bg: 'oklch(0.96 0.04 25)' },
  '높음': { color: 'oklch(0.52 0.16 60)',  bg: 'oklch(0.96 0.04 60)' },
  '보통': { color: 'oklch(0.52 0.08 260)', bg: 'oklch(0.96 0.02 260)' },
  '낮음': { color: 'var(--ink-3)',          bg: 'var(--surface-2)' },
};

function treeLayout(tickets) {
  const children = {};
  const roots = [];
  tickets.forEach((t) => { children[t.id] = []; });
  tickets.forEach((t) => {
    if (t.parentId && children[t.parentId]) children[t.parentId].push(t.id);
    else roots.push(t.id);
  });

  const pos = {};
  function sw(id) {
    const kids = children[id] || [];
    if (kids.length === 0) return NODE_W;
    return Math.max(NODE_W, kids.reduce((s, k) => s + sw(k) + H_GAP, -H_GAP));
  }
  function place(id, cx, y) {
    pos[id] = { x: cx - NODE_W / 2, y };
    const kids = children[id] || [];
    const total = kids.reduce((s, k) => s + sw(k) + H_GAP, -H_GAP);
    let kx = cx - total / 2;
    kids.forEach((kid) => {
      const w = sw(kid);
      place(kid, kx + w / 2, y + NODE_H + V_GAP);
      kx += w + H_GAP;
    });
  }
  let x = 60;
  roots.forEach((r) => {
    const w = sw(r);
    place(r, x + w / 2, 60);
    x += w + H_GAP;
  });
  return pos;
}

// ── Edges ──────────────────────────────────────────────────────────────────
function Edges({ tickets, positions }) {
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', width: 1, height: 1 }}>
      {tickets
        .filter((t) => t.parentId && positions[t.parentId] && positions[t.id])
        .map((t) => {
          const from = positions[t.parentId];
          const to = positions[t.id];
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const mid = (y1 + y2) / 2;
          return (
            <path
              key={`${t.parentId}-${t.id}`}
              d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
              fill="none"
              stroke="oklch(0.7 0.06 260)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
          );
        })}
    </svg>
  );
}

// ── Ticket Node ────────────────────────────────────────────────────────────
function TicketNode({ ticket, pos, selected, onSelect, onDragStart, onCopy, copied, connectFrom, onStartConnect, onConnect }) {
  const [hovered, setHovered] = useState(false);
  const statusInfo = STATUS_INFO[ticket.status] || STATUS_INFO['열림'];
  const priorityInfo = PRIORITY_INFO[ticket.priority || '보통'] || PRIORITY_INFO['보통'];
  const isConnectSource = connectFrom === ticket.id;
  const inConnectMode = connectFrom !== null;
  const isDone = ticket.status === '완료' || ticket.status === '닫힘';

  return (
    <div
      className={'tk-node' + (selected ? ' selected' : '') + (isDone ? ' tk-node-done' : '') + (isConnectSource ? ' connect-source' : '') + (inConnectMode && !isConnectSource ? ' connectable' : '')}
      style={{ left: pos.x, top: pos.y, width: NODE_W, ...(isDone && !selected ? { opacity: 0.55, filter: 'grayscale(0.7)' } : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (inConnectMode && !isConnectSource) {
          e.stopPropagation();
          onConnect(ticket.id);
          return;
        }
        e.stopPropagation();
        onSelect(ticket.id);
        onDragStart(e, ticket.id);
      }}
    >
      <div className="tk-node-hd">
        <span className="tk-code">{ticket.ticketCode}</span>
        <span className="tk-priority-tag" style={{ color: priorityInfo.color, background: priorityInfo.bg }}>
          {ticket.priority || '보통'}
        </span>
        <button
          className={'tk-copy-btn' + (copied === ticket.ticketCode ? ' copied' : '')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCopy(ticket.ticketCode); }}
          title="코드 복사"
        >
          {copied === ticket.ticketCode ? '✓' : '⎘'}
        </button>
      </div>
      <div className="tk-node-title">{ticket.title}</div>
      <div className="tk-node-ft">
        <span className="tk-node-status" style={{ color: statusInfo.color }}>● {ticket.status}</span>
        {ticket.assigneeName && <span className="tk-node-meta">@{ticket.assigneeName}</span>}
        {ticket.dueDate && <span className="tk-node-meta">📅 {ticket.dueDate}</span>}
        {(hovered || selected) && !inConnectMode && (
          <button
            className="tk-link-btn"
            title="상위 티켓 연결"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartConnect(ticket.id); }}
          >🔗</button>
        )}
        {isConnectSource && (
          <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginLeft: 'auto' }}>연결 대상 선택…</span>
        )}
      </div>
    </div>
  );
}

// ── Comments hook (inline) ─────────────────────────────────────────────────
function useTicketComments(projectId, ticketId) {
  const [comments, setComments] = useState([]);
  useEffect(() => {
    if (!projectId || !ticketId) return;
    const q = query(
      collection(db, 'projects', projectId, 'tickets', ticketId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [projectId, ticketId]);

  const addComment = async (text, authorName) => {
    if (!text.trim() || !projectId || !ticketId) return;
    await addDoc(
      collection(db, 'projects', projectId, 'tickets', ticketId, 'comments'),
      { text: text.trim(), authorName, createdAt: serverTimestamp() }
    );
  };

  return { comments, addComment };
}

// ── Ticket Detail Panel ────────────────────────────────────────────────────
function TicketDetail({ ticket, tickets, members, projectId, user, onUpdate, onDelete, onClose }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [desc, setDesc] = useState(ticket.description || '');
  const [status, setStatus] = useState(ticket.status);
  const [assigneeUid, setAssigneeUid] = useState(ticket.assigneeUid || '');
  const [dueDate, setDueDate] = useState(ticket.dueDate || '');
  const [priority, setPriority] = useState(ticket.priority || '보통');
  const [parentId, setParentId] = useState(ticket.parentId || '');
  const [commentText, setCommentText] = useState('');
  const { comments, addComment } = useTicketComments(projectId, ticket.id);

  const children = tickets.filter((t) => t.parentId === ticket.id);

  useEffect(() => {
    setTitle(ticket.title);
    setDesc(ticket.description || '');
    setStatus(ticket.status);
    setAssigneeUid(ticket.assigneeUid || '');
    setDueDate(ticket.dueDate || '');
    setPriority(ticket.priority || '보통');
    setParentId(ticket.parentId || '');
    setEditing(false);
  }, [ticket.id]); // eslint-disable-line

  const save = () => {
    const assignee = members.find((m) => m.uid === assigneeUid);
    onUpdate({
      title: title.trim() || ticket.title,
      description: desc.trim(),
      status,
      priority,
      dueDate: dueDate || null,
      assigneeUid: assigneeUid || null,
      assigneeName: assignee?.name || null,
      parentId: parentId || null,
    });
    setEditing(false);
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    await addComment(commentText, user?.name || '나');
    setCommentText('');
  };

  const statusInfo = STATUS_INFO[ticket.status] || STATUS_INFO['열림'];
  const priorityInfo = PRIORITY_INFO[ticket.priority || '보통'] || PRIORITY_INFO['보통'];

  return (
    <div className="tk-detail">
      <div className="tk-detail-hd">
        <span className="tk-code">{ticket.ticketCode}</span>
        <span className="tk-priority-tag" style={{ color: priorityInfo.color, background: priorityInfo.bg }}>
          {ticket.priority || '보통'}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? '취소' : '편집'}
        </button>
        <button className="tk-close" onClick={onClose}>✕</button>
      </div>

      {editing ? (
        <div className="tk-form">
          <label className="tk-label">제목</label>
          <input className="tk-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 *" />
          <label className="tk-label">설명</label>
          <textarea className="tk-ta" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명 (선택)" rows={3} />
          <label className="tk-label">상태</label>
          <select className="tk-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['열림', '진행중', '완료', '닫힘'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <label className="tk-label">우선순위</label>
          <select className="tk-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['낮음', '보통', '높음', '긴급'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <label className="tk-label">담당자</label>
          <select className="tk-select" value={assigneeUid} onChange={(e) => setAssigneeUid(e.target.value)}>
            <option value="">없음</option>
            {members.filter((m) => m.uid).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </select>
          <label className="tk-label">기한</label>
          <input className="tk-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <label className="tk-label">상위 티켓</label>
          <select className="tk-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">없음</option>
            {tickets.filter((t) => t.id !== ticket.id).map((t) => (
              <option key={t.id} value={t.id}>{t.ticketCode} {t.title}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn accent sm" style={{ flex: 1 }} onClick={save}>저장</button>
            <button
              className="btn sm"
              style={{ background: 'var(--rose-bg)', color: 'var(--rose)', border: '1px solid var(--rose-line)' }}
              onClick={() => { if (window.confirm('티켓을 삭제하시겠습니까?')) { onDelete(); onClose(); } }}
            >🗑️ 삭제</button>
          </div>
        </div>
      ) : (
        <div className="tk-detail-view">
          <div className="tk-detail-title">{ticket.title}</div>
          {ticket.description && <div className="tk-detail-desc">{ticket.description}</div>}
          {/* 인라인 편집 — 편집 버튼 없이 바로 변경, 선택 즉시 확정 */}
          <div className="tk-detail-row">
            <span>상태</span>
            <select
              className="tk-inline-edit"
              value={ticket.status}
              onChange={(e) => onUpdate({ status: e.target.value })}
              style={{ color: statusInfo.color, fontWeight: 600 }}
            >
              {['열림', '진행중', '완료', '닫힘'].map((s) => <option key={s} value={s}>● {s}</option>)}
            </select>
          </div>
          <div className="tk-detail-row">
            <span>우선순위</span>
            <select
              className="tk-inline-edit"
              value={ticket.priority || '보통'}
              onChange={(e) => onUpdate({ priority: e.target.value })}
              style={{ color: priorityInfo.color, fontWeight: 600 }}
            >
              {['낮음', '보통', '높음', '긴급'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="tk-detail-row">
            <span>담당자</span>
            <select
              className="tk-inline-edit"
              value={ticket.assigneeUid || ''}
              onChange={(e) => {
                const m = members.find((mm) => mm.uid === e.target.value);
                onUpdate({ assigneeUid: e.target.value || null, assigneeName: m?.name || null });
              }}
            >
              <option value="">없음</option>
              {members.filter((m) => m.uid).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          </div>
          <div className="tk-detail-row">
            <span>기한</span>
            <input
              className="tk-inline-edit"
              type="date"
              value={ticket.dueDate || ''}
              onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
            />
          </div>
          {ticket.parentId && (
            <div className="tk-detail-row">
              <span>상위 티켓</span>
              <span className="tk-code-sm">{tickets.find((t) => t.id === ticket.parentId)?.ticketCode || '—'}</span>
            </div>
          )}
          {children.length > 0 && (
            <div className="tk-detail-section">
              <div className="tk-detail-sec-label">하위 티켓 ({children.length})</div>
              {children.map((c) => (
                <div key={c.id} className="tk-detail-child">
                  <span className="tk-code-sm">{c.ticketCode}</span>
                  <span>{c.title}</span>
                  <span style={{ color: (STATUS_INFO[c.status] || STATUS_INFO['열림']).color, fontSize: 10, marginLeft: 'auto' }}>● {c.status}</span>
                </div>
              ))}
            </div>
          )}
          {(ticket.history || []).length > 0 && (
            <div className="tk-detail-section">
              <div className="tk-detail-sec-label">✓ 완료된 태스크 ({ticket.history.length})</div>
              {[...ticket.history].reverse().map((h, i) => {
                const origIdx = ticket.history.length - 1 - i;
                return (
                  <div key={origIdx} className="tk-detail-history">
                    <span className="tk-hist-check">✓</span>
                    <span className="tk-hist-title">{h.taskTitle}</span>
                    {h.memberName && <span className="tk-hist-who">@{h.memberName}</span>}
                    <span className="tk-hist-date">{h.completedAt?.slice(0, 10)}</span>
                    <button
                      className="tk-hist-del"
                      title="이 기록 삭제"
                      onClick={() => {
                        if (!window.confirm('이 완료 기록을 삭제하시겠습니까?')) return;
                        const next = ticket.history.filter((_, idx) => idx !== origIdx);
                        onUpdate({ history: next });
                      }}
                      style={{ marginLeft: 6, border: 0, background: 'transparent', color: 'var(--ink-mute)', cursor: 'pointer', fontSize: 12 }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Comments section */}
          <div className="tk-detail-section">
            <div className="tk-detail-sec-label">댓글 {comments.length > 0 && `(${comments.length})`}</div>
            {comments.map((c) => (
              <div key={c.id} className="tk-comment">
                <span className="tk-comment-author">{c.authorName}</span>
                <span className="tk-comment-text">{c.text}</span>
              </div>
            ))}
            <div className="tk-comment-input-row">
              <input
                className="tk-input"
                placeholder="댓글 입력…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
              />
              <button className="btn accent sm" onClick={handleSendComment} disabled={!commentText.trim()}>전송</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Modal ───────────────────────────────────────────────────────────
function CreateModal({ tickets, members, project, user, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [assigneeUid, setAssigneeUid] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('보통');
  const [parentId, setParentId] = useState('');

  const handle = () => {
    if (!title.trim()) return;
    const assignee = members.find((m) => m.uid === assigneeUid);
    onCreate({
      title: title.trim(),
      description: desc.trim(),
      assigneeUid: assigneeUid || null,
      assigneeName: assignee?.name || null,
      dueDate: dueDate || null,
      priority,
      parentId: parentId || null,
      createdBy: user?.uid,
    });
  };

  return (
    <div className="tk-modal-overlay" onClick={onClose}>
      <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tk-modal-hd">
          <span>🎫 새 티켓 만들기</span>
          <button className="tk-close" onClick={onClose}>✕</button>
        </div>
        <div className="tk-form">
          <label className="tk-label">제목 *</label>
          <input className="tk-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="티켓 제목" autoFocus onKeyDown={(e) => e.key === 'Enter' && handle()} />
          <label className="tk-label">설명</label>
          <textarea className="tk-ta" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명 (선택)" rows={3} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="tk-label">우선순위</label>
              <select className="tk-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['낮음', '보통', '높음', '긴급'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="tk-label">담당자</label>
              <select className="tk-select" value={assigneeUid} onChange={(e) => setAssigneeUid(e.target.value)}>
                <option value="">없음</option>
                {members.filter((m) => m.uid).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <label className="tk-label">기한</label>
          <input className="tk-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <label className="tk-label">상위 티켓 (선택)</label>
          <select className="tk-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">없음</option>
            {tickets.map((t) => <option key={t.id} value={t.id}>{t.ticketCode} {t.title}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn ghost sm" onClick={onClose}>취소</button>
            <button className="btn accent sm" onClick={handle} disabled={!title.trim()}>만들기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main TicketTab ─────────────────────────────────────────────────────────
export default function TicketTab({ projectId, project, tickets, createTicket, updateTicket, deleteTicket, user }) {
  const members = project?.members || [];
  const [positions, setPositions] = useState({});
  const [drag, setDrag] = useState(null);
  const [panStart, setPanStart] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(null);
  const [connectFrom, setConnectFrom] = useState(null);
  const canvasRef = useRef(null);
  const contentRef = useRef(null);
  const livePan = useRef(pan);

  // 팬/줌 중에는 setState 없이 transform 을 직접 갱신 → 리렌더 제거 (딜레이 해소)
  const applyTransform = (px, py, z) => {
    if (contentRef.current) contentRef.current.style.transform = `translate(${px}px, ${py}px) scale(${z})`;
  };

  // Initialize node positions (from Firestore x/y, or tree layout for new)
  useEffect(() => {
    setPositions((prev) => {
      const next = {};
      const needsLayout = [];
      tickets.forEach((t, i) => {
        if (prev[t.id]) {
          next[t.id] = prev[t.id];
        } else if (typeof t.x === 'number') {
          next[t.id] = { x: t.x, y: t.y };
        } else {
          needsLayout.push({ t, i });
        }
      });
      if (needsLayout.length > 0) {
        const layout = treeLayout(tickets);
        needsLayout.forEach(({ t }) => {
          next[t.id] = layout[t.id] || { x: 60 + Object.keys(next).length * 260, y: 60 };
        });
      }
      return next;
    });
  }, [tickets.length]); // eslint-disable-line

  // Global drag handler
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      setPositions((prev) => ({
        ...prev,
        [drag.ticketId]: {
          x: drag.origX + (e.clientX - drag.startX) / zoom,
          y: drag.origY + (e.clientY - drag.startY) / zoom,
        },
      }));
    };
    const onUp = (e) => {
      const newPos = {
        x: drag.origX + (e.clientX - drag.startX) / zoom,
        y: drag.origY + (e.clientY - drag.startY) / zoom,
      };
      updateTicket(drag.ticketId, newPos);
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]); // eslint-disable-line

  // Global pan handler — transform 직접 갱신(리렌더 없음), 종료 시 1회 커밋
  useEffect(() => {
    if (!panStart) return;
    const onMove = (e) => {
      const nx = panStart.panX + e.clientX - panStart.x;
      const ny = panStart.panY + e.clientY - panStart.y;
      livePan.current = { x: nx, y: ny };
      applyTransform(nx, ny, zoom);
    };
    const onUp = () => { setPan(livePan.current); setPanStart(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panStart, zoom]);

  // Ctrl/⌘ + 휠 → 커서 기준 확대/축소 (native 리스너로 passive:false 지정)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // 일반 스크롤은 그대로
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.min(2.5, Math.max(0.3, zoom * factor));
      // 커서 아래 월드 좌표가 고정되도록 pan 보정
      const wx = (mx - pan.x) / zoom;
      const wy = (my - pan.y) / zoom;
      const npx = mx - wx * newZoom;
      const npy = my - wy * newZoom;
      livePan.current = { x: npx, y: npy };
      setZoom(newZoom);
      setPan({ x: npx, y: npy });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pan, zoom]);

  const handleDragStart = useCallback((e, ticketId) => {
    const pos = positions[ticketId] || { x: 0, y: 0 };
    setDrag({ ticketId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  }, [positions]);

  const handleCanvasDown = (e) => {
    if (e.target === canvasRef.current || e.currentTarget === e.target) {
      if (connectFrom) { setConnectFrom(null); return; }
      livePan.current = { x: pan.x, y: pan.y };
      setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
      setSelected(null);
    }
  };

  // Escape key cancels connect mode
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setConnectFrom(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleConnect = useCallback((targetTicketId) => {
    if (!connectFrom || connectFrom === targetTicketId) { setConnectFrom(null); return; }
    updateTicket(connectFrom, { parentId: targetTicketId });
    setConnectFrom(null);
  }, [connectFrom, updateTicket]);

  const copyCode = async (code) => {
    try { await navigator.clipboard.writeText(code); } catch { }
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const selectedTicket = tickets.find((t) => t.id === selected);

  const handleCreate = async (data) => {
    const ticketCode = `${project?.pf || 'T'}-${String(tickets.length + 1).padStart(3, '0')}`;
    // 현재 보고 있는 화면 중앙(월드 좌표)에 생성
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 300;
    const cy = rect ? rect.height / 2 : 200;
    const x = (cx - pan.x) / zoom - NODE_W / 2;
    const y = (cy - pan.y) / zoom - NODE_H / 2;
    await createTicket({
      ...data,
      ticketCode,
      status: '열림',
      x,
      y,
    });
    setShowCreate(false);
  };

  return (
    <div className="tk-root">
      <div className="tk-toolbar">
        <span className="tk-toolbar-title">
          워크트리
          <span className="mono" style={{ fontSize: 12, opacity: 0.5, marginLeft: 6 }}>{tickets.length}</span>
        </span>
        <button className="btn accent sm" onClick={() => setShowCreate(true)}>+ 새 티켓</button>
      </div>

      {connectFrom && (
        <div style={{ padding: '6px 14px', background: 'var(--accent-soft)', borderBottom: '1px solid var(--accent-line)', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
          🔗 연결할 상위 티켓을 클릭하세요
          <button style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12 }} onClick={() => setConnectFrom(null)}>취소 (Esc)</button>
        </div>
      )}
      <div className="tk-body">
        <div
          ref={canvasRef}
          className={'tk-canvas' + (panStart ? ' panning' : '')}
          onMouseDown={handleCanvasDown}
        >
          <div ref={contentRef} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'relative', width: 0, height: 0 }}>
            <Edges tickets={tickets} positions={positions} />
            {tickets.map((t) => (
              <TicketNode
                key={t.id}
                ticket={t}
                pos={positions[t.id] || { x: 60, y: 60 }}
                selected={selected === t.id}
                onSelect={setSelected}
                onDragStart={handleDragStart}
                onCopy={copyCode}
                copied={copied}
                connectFrom={connectFrom}
                onStartConnect={(id) => { setConnectFrom(id); setSelected(id); }}
                onConnect={handleConnect}
              />
            ))}
          </div>

          {tickets.length === 0 && (
            <div className="tk-empty-state">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>티켓이 없습니다</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>채팅에서 /티켓 명령어로 생성하거나<br />위의 + 버튼을 사용하세요</div>
            </div>
          )}

          {copied && (
            <div className="tk-toast">✓ {copied} 복사됨</div>
          )}
        </div>

        {selectedTicket && (
          <TicketDetail
            ticket={selectedTicket}
            tickets={tickets}
            members={members}
            projectId={projectId}
            user={user}
            onUpdate={(fields) => updateTicket(selectedTicket.id, fields)}
            onDelete={() => deleteTicket?.(selectedTicket.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      {showCreate && (
        <CreateModal
          tickets={tickets}
          members={members}
          project={project}
          user={user}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
