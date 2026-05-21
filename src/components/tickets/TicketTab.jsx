import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

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
function TicketNode({ ticket, pos, selected, onSelect, onDragStart, onCopy, copied }) {
  const statusInfo = STATUS_INFO[ticket.status] || STATUS_INFO['열림'];
  const priorityInfo = PRIORITY_INFO[ticket.priority || '보통'] || PRIORITY_INFO['보통'];

  return (
    <div
      className={'tk-node' + (selected ? ' selected' : '')}
      style={{ left: pos.x, top: pos.y, width: NODE_W }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
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
      </div>
    </div>
  );
}

// ── Ticket Detail Panel ────────────────────────────────────────────────────
function TicketDetail({ ticket, tickets, members, onUpdate, onClose }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [desc, setDesc] = useState(ticket.description || '');
  const [status, setStatus] = useState(ticket.status);
  const [assigneeUid, setAssigneeUid] = useState(ticket.assigneeUid || '');
  const [dueDate, setDueDate] = useState(ticket.dueDate || '');
  const [priority, setPriority] = useState(ticket.priority || '보통');
  const [parentId, setParentId] = useState(ticket.parentId || '');

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
          <button className="btn accent sm" style={{ marginTop: 4 }} onClick={save}>저장</button>
        </div>
      ) : (
        <div className="tk-detail-view">
          <div className="tk-detail-title">{ticket.title}</div>
          {ticket.description && <div className="tk-detail-desc">{ticket.description}</div>}
          <div className="tk-detail-row"><span>상태</span><span style={{ color: statusInfo.color }}>● {ticket.status}</span></div>
          <div className="tk-detail-row"><span>우선순위</span><span style={{ color: priorityInfo.color }}>{ticket.priority || '보통'}</span></div>
          {ticket.assigneeName && <div className="tk-detail-row"><span>담당자</span><span>@{ticket.assigneeName}</span></div>}
          {ticket.dueDate && <div className="tk-detail-row"><span>기한</span><span>{ticket.dueDate}</span></div>}
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
export default function TicketTab({ projectId, project, tickets, createTicket, updateTicket, user }) {
  const members = project?.members || [];
  const [positions, setPositions] = useState({});
  const [drag, setDrag] = useState(null);
  const [panStart, setPanStart] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(null);
  const canvasRef = useRef(null);

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
          x: drag.origX + e.clientX - drag.startX,
          y: drag.origY + e.clientY - drag.startY,
        },
      }));
    };
    const onUp = (e) => {
      const newPos = {
        x: drag.origX + e.clientX - drag.startX,
        y: drag.origY + e.clientY - drag.startY,
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

  // Global pan handler
  useEffect(() => {
    if (!panStart) return;
    const onMove = (e) => {
      setPan({ x: panStart.panX + e.clientX - panStart.x, y: panStart.panY + e.clientY - panStart.y });
    };
    const onUp = () => setPanStart(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panStart]);

  const handleDragStart = useCallback((e, ticketId) => {
    const pos = positions[ticketId] || { x: 0, y: 0 };
    setDrag({ ticketId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  }, [positions]);

  const handleCanvasDown = (e) => {
    if (e.target === canvasRef.current || e.currentTarget === e.target) {
      setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
      setSelected(null);
    }
  };

  const copyCode = async (code) => {
    try { await navigator.clipboard.writeText(code); } catch { }
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const selectedTicket = tickets.find((t) => t.id === selected);

  const handleCreate = async (data) => {
    const ticketCode = `${project?.pf || 'T'}-${String(tickets.length + 1).padStart(3, '0')}`;
    await createTicket({
      ...data,
      ticketCode,
      status: '열림',
      x: 80 + Math.random() * 500,
      y: 80 + Math.random() * 200,
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

      <div className="tk-body">
        <div
          ref={canvasRef}
          className={'tk-canvas' + (panStart ? ' panning' : '')}
          onMouseDown={handleCanvasDown}
        >
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, position: 'relative', width: 0, height: 0 }}>
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
            onUpdate={(fields) => updateTicket(selectedTicket.id, fields)}
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
