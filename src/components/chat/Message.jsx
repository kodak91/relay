import { useState, useEffect, useRef, createContext, useContext, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useAppStore from '../../store/appStore';
import { claudeComplete } from '../../lib/claude';

const QUICK_EMOJIS = ['✅', '⭕', '❌', '👀', '😊', '😢'];
const MsgContext = createContext({ uid: null, onReact: null, onEditReply: null, onDeleteReply: null });

// 58: all markdown links open in new tab; 60: relay-kb:// links navigate to KB tab
const MD_LINK = {
  a: ({ href, children }) => {
    if (href?.startsWith('relay-kb://')) {
      return (
        <a href="#" style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}
          onClick={(e) => {
            e.preventDefault();
            const parts = href.replace('relay-kb://', '').split('/');
            const [, folderId, fileId] = parts;
            const store = useAppStore.getState();
            store.setChatTab('kb');
            store.setKbDeepLink({ folderId: folderId || null, fileId: fileId || null });
          }}
        >{children}</a>
      );
    }
    return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
  },
};

const AVATAR_COLORS = [
  'oklch(0.45 0.20 270)',
  'oklch(0.55 0.16 25)',
  'oklch(0.55 0.14 145)',
  'oklch(0.55 0.16 320)',
  'oklch(0.55 0.14 195)',
];

function getColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function Avatar({ name, size = 36 }) {
  const initial = name ? name[0] : '?';
  const color = name === 'AI' ? 'oklch(0.45 0.20 280)' : getColor(name);
  return (
    <div className="av" style={{ width: size, height: size, background: color, fontSize: size <= 22 ? 9 : 12, flexShrink: 0 }}>
      {name === 'AI' ? '✦' : initial}
    </div>
  );
}

function MsgActions({ m, onReply, onEdit, onDelete, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const { onReact } = useContext(MsgContext);
  const [dropOpen, setDropOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const dropRef = useRef(null);
  const pickerRef = useRef(null);
  const isMine = user?.uid && m.senderUid === user.uid;

  useEffect(() => {
    if (!dropOpen && !pickerOpen && !taskPickerOpen) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) { setDropOpen(false); setTaskPickerOpen(false); }
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen, pickerOpen, taskPickerOpen]);

  return (
    <div className="msg-actions">
      <div style={{ position: 'relative' }} ref={pickerRef}>
        <button title="이모지 리액션" onClick={() => setPickerOpen((v) => !v)}>😊</button>
        {pickerOpen && (
          <div className="emoji-picker-pop">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                className="emoji-pick-btn"
                onClick={() => { onReact?.(e); setPickerOpen(false); }}
                title={e}
              >{e}</button>
            ))}
          </div>
        )}
      </div>
      {onReply && <button title="답글" onClick={onReply}>↩</button>}
      <div style={{ position: 'relative' }} ref={dropRef}>
        <button title="더보기" onClick={() => setDropOpen((v) => !v)}>⋯</button>
        {dropOpen && (
          <div className="msg-drop">
            {isMine && onEdit && (
              <button onClick={() => { onEdit(); setDropOpen(false); }}>✏️ 편집</button>
            )}
            {isMine && (
              <button className="danger" onClick={() => { onDelete(); setDropOpen(false); }}>🗑️ 삭제</button>
            )}
            {!isMine && (
              <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--ink-mute)' }}>내 메시지만 수정 가능</div>
            )}
            {onAddTask && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button onClick={() => setTaskPickerOpen((v) => !v)}>📌 태스크+</button>
              </>
            )}
            {taskPickerOpen && onAddTask && (members || []).length > 0 && (
              <div style={{ padding: '4px 6px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: '2px 6px', marginBottom: 2 }}>멤버 선택</div>
                {(members || []).filter((mb) => mb.uid).map((mb) => (
                  <button
                    key={mb.uid}
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      onAddTask(mb, m);
                      setTaskPickerOpen(false);
                      setDropOpen(false);
                    }}
                  >
                    {mb.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Reactions({ list }) {
  const { uid, onReact } = useContext(MsgContext);
  if (!list || list.length === 0) return null;
  const visible = list.filter((r) => (r.uids?.length ?? r.n ?? 0) > 0);
  if (visible.length === 0) return null;
  return (
    <div className="rx-row">
      {visible.map((r, i) => {
        const count = r.uids?.length ?? r.n ?? 0;
        const mine = uid ? (r.uids?.includes(uid) ?? !!r.mine) : !!r.mine;
        return (
          <button
            key={i}
            className={'rx' + (mine ? ' mine' : '')}
            onClick={() => onReact?.(r.e)}
            title={r.e}
          >{r.e} {count}</button>
        );
      })}
    </div>
  );
}

function ThreadToggle({ count, hasNew, open, onClick }) {
  if (!count) return null;
  return (
    <button className={'thread-toggle' + (open ? ' open' : '')} onClick={onClick}>
      <span className="caret">▶</span>
      <span>스레드</span>
      <span className="num">({count})</span>
      {hasNew && <span className="new-dot" />}
    </button>
  );
}

function Thread({ items, onSend, senderName, members = [] }) {
  const { uid, onEditReply, onDeleteReply } = useContext(MsgContext);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState('');

  // 답글 입력값은 이 스레드 로컬 state — 부모(Message/ChatMain)로 올리지 않아야
  // 한 글자 칠 때마다 채팅방 전체 메시지 목록이 리렌더되는 걸 막을 수 있다.
  const [replyValue, setReplyValueLocal] = useState('');
  const onReplyChange = setReplyValueLocal;

  // @멘션 — 스레드 답글에서도 멤버 언급
  const replyRef = useRef(null);
  const [mOpen, setMOpen] = useState(false);
  const [mItems, setMItems] = useState([]);
  const [mIndex, setMIndex] = useState(0);

  const updateMention = (val, caret) => {
    const before = val.slice(0, caret ?? val.length);
    const mt = before.match(/@([^\s@]*)$/);
    if (!mt) { setMOpen(false); return; }
    const q = mt[1].toLowerCase();
    const list = (members || []).filter((m) => m.uid && (!q || (m.name || '').toLowerCase().includes(q))).slice(0, 8);
    setMItems(list); setMIndex(0); setMOpen(list.length > 0);
  };
  const pickMention = (m) => {
    const el = replyRef.current;
    const caret = el?.selectionStart ?? replyValue.length;
    const before = replyValue.slice(0, caret);
    const after = replyValue.slice(caret);
    const mt = before.match(/@([^\s@]*)$/);
    if (!mt) { setMOpen(false); return; }
    const start = caret - mt[0].length;
    const insert = `@${m.name} `;
    onReplyChange(replyValue.slice(0, start) + insert + after);
    setMOpen(false);
    const pos = start + insert.length;
    setTimeout(() => { const e = replyRef.current; if (e) { e.focus(); e.setSelectionRange(pos, pos); } }, 0);
  };

  const handleSend = () => {
    if (!replyValue.trim()) return;
    onSend(replyValue);
    setReplyValueLocal('');
  };

  return (
    <div className="thread">
      {items.map((t, i) => {
        const isMine = uid && t.senderUid ? t.senderUid === uid : uid && (t.senderName === senderName);
        const isEditing = editingIndex === i;
        return (
          <div className="thread-item" key={i}>
            <Avatar name={t.senderName || t.from} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="msg-head" style={{ position: 'relative' }}>
                <span className="name" style={{ fontSize: 13 }}>{t.senderName || t.from}</span>
                <span className="ts">{t.ts}</span>
                {t.isNew && <span className="thread-new">NEW</span>}
                {isMine && !isEditing && (
                  <div className="thread-item-actions">
                    <button onClick={() => { setEditText(t.text); setEditingIndex(i); }} title="편집">✏️</button>
                    <button className="danger" onClick={() => onDeleteReply?.(i)} title="삭제">🗑️</button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="edit-mode" style={{ marginTop: 4 }}>
                  <textarea
                    className="edit-ta"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editText.trim()) { onEditReply?.(i, editText.trim()); setEditingIndex(null); } }
                      if (e.key === 'Escape') setEditingIndex(null);
                    }}
                    rows={Math.max(2, editText.split('\n').length)}
                    autoFocus
                  />
                  <div className="edit-btns">
                    <button className="btn sm ghost" onClick={() => setEditingIndex(null)}>취소</button>
                    <button className="btn sm accent" onClick={() => { if (editText.trim()) { onEditReply?.(i, editText.trim()); setEditingIndex(null); } }}>저장</button>
                  </div>
                </div>
              ) : (
                <div className="msg-body" style={{ fontSize: 13 }}>
                  {t.text}
                  {t.editedAt && <span className="edited-badge">(편집됨)</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="thread-reply">
        <Avatar name={senderName} size={28} />
        <input
          ref={replyRef}
          placeholder="스레드에 답글… (@로 멘션)"
          value={replyValue}
          onChange={(e) => { onReplyChange(e.target.value); updateMention(e.target.value, e.target.selectionStart); }}
          onKeyDown={(e) => {
            if (mOpen && mItems.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMIndex((i) => (i + 1) % mItems.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMIndex((i) => (i - 1 + mItems.length) % mItems.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mItems[mIndex]); return; }
              if (e.key === 'Escape') { setMOpen(false); return; }
            }
            if (e.key === 'Enter') handleSend();
          }}
        />
        {mOpen && (() => {
          const r = replyRef.current?.getBoundingClientRect();
          const st = r ? { left: Math.round(r.left), bottom: Math.round(window.innerHeight - r.top + 4) } : {};
          return (
            <div className="mention-pop" style={st}>
              <div className="mention-pop-hd">멤버 멘션 — 클릭 또는 Enter</div>
              {mItems.map((m, i) => (
                <button
                  key={m.uid}
                  className={'mention-item' + (i === mIndex ? ' on' : '')}
                  onMouseEnter={() => setMIndex(i)}
                  onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
                >
                  <span className="mention-ava">{(m.name || '?').slice(0, 1)}</span>
                  <span className="mention-nm">{m.name}</span>
                  {m.role === 'lead' && <span className="mention-role">팀장</span>}
                </button>
              ))}
            </div>
          );
        })()}
        <button className="btn sm accent" onClick={handleSend}>전송</button>
      </div>
    </div>
  );
}

// SVG donut timer for casual messages
function DonutTimer({ expiresAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const total = 60 * 60 * 1000;
  const left = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const pct = left / total;
  const r = 7;
  const c = 2 * Math.PI * r;
  const dash = pct * c;
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} title={`${Math.floor(left / 60000)}분 남음`}>
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--ink-mute)" strokeWidth="2.5"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
    </svg>
  );
}

// ─── Message type renderers ──────────────────────────────────────────────

function TextMsg({ m, isGrouped, isGroupStart, threadOpen, onToggleThread, onSend, onConfirm, onNudge, onEdit, onDelete, senderName, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isSender = user?.uid && m.senderUid === user.uid;
  const confirmed = m.confirmedBy?.includes(user?.uid);
  const [nudgeSent, setNudgeSent] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const handleNudge = () => {
    onNudge(m.id);
    setNudgeSent(true);
    setTimeout(() => setNudgeSent(false), 3000);
  };

  const startEdit = () => { setEditText(m.text || ''); setEditMode(true); };
  const saveEdit = () => { if (editText.trim()) onEdit(m.id, editText.trim()); setEditMode(false); };

  const body = (
    <>
      {editMode ? (
        <div className="edit-mode">
          <textarea
            className="edit-ta"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
            rows={Math.max(2, editText.split('\n').length)}
            autoFocus
          />
          <div className="edit-btns">
            <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
            <button className="btn sm accent" onClick={saveEdit}>저장</button>
          </div>
        </div>
      ) : (
        <div className="msg-body md-content">
          {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
          <ReactMarkdown components={MD_LINK} remarkPlugins={[remarkGfm]}>{m.text || ''}</ReactMarkdown>
          {m.editedAt && <span className="edited-badge">(편집됨)</span>}
        </div>
      )}
      {m.importance > 0 && !editMode && (
        <div className="importance-actions">
          <label className="importance-check">
            <input type="checkbox" checked={!!confirmed} onChange={() => !confirmed && onConfirm(m.id)} />
            <span>{confirmed ? '✓ 확인함' : '확인'}</span>
          </label>
          {isSender && (
            <button className="nudge-btn" onClick={handleNudge} disabled={nudgeSent}>
              {nudgeSent ? '재촉 전송됨 ✓' : '🔔 재촉'}
            </button>
          )}
          {m.nudgedAt && !isSender && (
            <span className="nudge-badge">🔔 재촉 알림</span>
          )}
        </div>
      )}
      <Reactions list={m.reactions} />
      <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
      {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
    </>
  );

  // Grouped: same sender, no avatar/header repeated
  if (isGrouped) {
    return (
      <div className={'msg grouped' + (m.importance > 0 ? ' importance-msg imp-' + m.importance : '') + (isGroupStart ? ' group-start' : '')}>
        <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={startEdit} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
        <div className="msg-grouped-spacer" />
        <div style={{ flex: 1 }}>{body}</div>
      </div>
    );
  }

  const cls = 'msg' + (m.importance > 0 ? ' importance-msg imp-' + m.importance : '') + (isGroupStart ? ' group-start' : '');
  return (
    <div className={cls}>
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={startEdit} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        {body}
      </div>
    </div>
  );
}

function DecisionMsg({ m, threadOpen, onToggleThread, onSend, onChoose, onDelete, onEditFields, senderName, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isSender = user?.uid && m.senderUid === user.uid;
  const canDecide = m.targetUid
    ? user?.uid === m.targetUid
    : user?.role === 'lead';
  const waitingFor = m.targetName || '팀장';
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const canEdit = isSender && !m.chosen;
  const startEdit = () => { setEditTitle(m.title || ''); setEditMode(true); };
  const saveEdit = () => { if (editTitle.trim()) onEditFields?.(m.id, { title: editTitle.trim() }); setEditMode(false); };

  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={canEdit ? startEdit : undefined} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="decision-card">
          <div className="dc-meta">
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>◇ 결정 요청</span>
            {m.targetName && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>→ {m.targetName}</span>}
            {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
            {m.due && <span className="due">📅 {m.due}</span>}
          </div>
          {editMode ? (
            <div className="edit-mode">
              <input
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '7px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box' }}
                value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
                autoFocus
              />
              <div className="edit-btns">
                <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
                <button className="btn sm accent" onClick={saveEdit}>저장</button>
              </div>
            </div>
          ) : (
            <div className="dc-header">{m.title}</div>
          )}
          <div className="dc-options">
            {(m.options || []).map((opt) => (
              <div
                key={opt.letter}
                className={'dc-opt' + (m.chosen === opt.letter ? ' chosen' : '') + (!canDecide && !m.chosen ? ' locked' : '')}
                style={!canDecide && !m.chosen ? { cursor: 'default', opacity: 0.6 } : {}}
                onClick={() => !m.chosen && canDecide && onChoose(m.id, opt.letter)}
              >
                <div className="letter">{opt.letter}</div>
                <div className="title">{opt.title}</div>
              </div>
            ))}
          </div>
          {!m.chosen && !canDecide && <p style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-3)' }}>⏳ {waitingFor}이(가) 결정합니다</p>}
          {!m.chosen && canDecide && <p style={{ marginTop: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>👆 옵션을 선택해주세요</p>}
          {m.chosen && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--emerald)', fontWeight: 600 }}>✓ {m.chosen}안 선택됨</p>}
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
      </div>
    </div>
  );
}

function ApprovalMsg({ m, threadOpen, onToggleThread, onSend, onAct, onDelete, onEdit, senderName, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isSender = user?.uid && m.senderUid === user.uid;
  // targetUid 지정 시 해당 유저만, 미지정 시 lead 역할만 액션 가능
  const canAct = m.targetUid ? user?.uid === m.targetUid : user?.role === 'lead';
  const waitingFor = m.targetName || '팀장';
  const [holdDate, setHoldDate] = useState('');
  const [showHoldPicker, setShowHoldPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const status = m.status || 'pending';
  const isPending = status === 'pending';
  const statusClass = status === 'approved' ? 'approved' : status === 'done' ? 'done' : status === 'held' ? 'held' : '';

  const startEdit = () => { setEditText(m.text || ''); setEditMode(true); };
  const saveEdit = () => { if (editText.trim()) onEdit?.(m.id, editText.trim()); setEditMode(false); };

  const handleHold = () => {
    if (showHoldPicker) {
      onAct(m.id, 'hold', holdDate || null);
      setShowHoldPicker(false);
    } else {
      setShowHoldPicker(true);
    }
  };

  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={isSender && isPending ? startEdit : undefined} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className={'approval-card ' + statusClass}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'oklch(0.42 0.13 70)', fontWeight: 700 }}>✓ 컨펌 요청</span>
            {m.targetName && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>→ {m.targetName}</span>}
            {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
          </div>
          {editMode ? (
            <div className="edit-mode">
              <textarea className="edit-ta" value={editText} onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
                rows={Math.max(2, editText.split('\n').length)} autoFocus />
              <div className="edit-btns">
                <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
                <button className="btn sm accent" onClick={saveEdit}>저장</button>
              </div>
            </div>
          ) : (
            <div className="ac-desc md-content">
              <ReactMarkdown components={MD_LINK} remarkPlugins={[remarkGfm]}>{m.text || ''}</ReactMarkdown>
            </div>
          )}
          <div className="ac-actions">
            {isPending ? (
              canAct ? (
                <>
                  <button className="btn accent sm" onClick={() => onAct(m.id, 'approve')}>OK</button>
                  <button className="btn minor sm" onClick={() => onAct(m.id, 'complete')}>반려</button>
                  <button className="btn ghost sm" onClick={handleHold}>보류</button>
                  {showHoldPicker && (
                    <div className="hold-picker">
                      <input type="date" value={holdDate} onChange={(e) => setHoldDate(e.target.value)} />
                      <button className="btn accent sm" onClick={handleHold}>확인</button>
                    </div>
                  )}
                </>
              ) : (
                <span className="ac-status" style={{ color: 'var(--ink-3)', fontSize: 12 }}>⏳ {waitingFor} 검토 대기 중</span>
              )
            ) : status === 'held' ? (
              <span className="ac-status held">⏸ 보류{m.heldUntil ? ` (${m.heldUntil}까지)` : ''}</span>
            ) : (
              <span className={'ac-status ' + status}>
                {status === 'approved' ? '✓ OK' : status === 'done' ? '✗ 반려됨' : ''}
              </span>
            )}
          </div>
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
      </div>
    </div>
  );
}

function ImageMsg({ m, threadOpen, onToggleThread, onSend, onEdit, onDelete, senderName, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isMine = user?.uid && m.senderUid === user.uid;
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const startEdit = () => { setEditText(m.text || ''); setEditMode(true); };
  const saveEdit = () => { onEdit?.(m.id, editText.trim()); setEditMode(false); };

  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={isMine ? startEdit : undefined} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        {editMode ? (
          <div className="edit-mode" style={{ marginBottom: 4 }}>
            <textarea
              className="edit-ta"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
              rows={Math.max(2, editText.split('\n').length)}
              placeholder="설명(캡션)을 입력하세요…"
              autoFocus
            />
            <div className="edit-btns">
              <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
              <button className="btn sm accent" onClick={saveEdit}>저장</button>
            </div>
          </div>
        ) : (
          m.text && (
            <div className="msg-body" style={{ marginBottom: 4 }}>
              <p>{m.text}</p>
              {m.editedAt && <span className="edited-badge">(편집됨)</span>}
            </div>
          )
        )}
        <div className="image-preview" onClick={() => setExpanded(true)}>
          <img src={m.fileUrl} alt={m.fileName} loading="lazy" />
          <div className="image-name">{m.fileName}</div>
        </div>
        {expanded && (
          <div className="image-lightbox" onClick={() => setExpanded(false)}>
            <img src={m.fileUrl} alt={m.fileName} />
          </div>
        )}
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
      </div>
    </div>
  );
}

function VoteMsg({ m, onVote, onDelete, onEditFields, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isSender = user?.uid && m.senderUid === user.uid;
  const totalVotes = (m.options || []).reduce((sum, o) => sum + (o.votes?.length || 0), 0);
  const myVote = (m.options || []).find((o) => (o.votes || []).some((v) => v.uid === user?.uid || v.name === user?.name));
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const canEdit = isSender && totalVotes === 0;
  const startEdit = () => { setEditTitle(m.title || ''); setEditMode(true); };
  const saveEdit = () => { if (editTitle.trim()) onEditFields?.(m.id, { title: editTitle.trim() }); setEditMode(false); };

  return (
    <div className="msg">
      <MsgActions m={m} onEdit={canEdit ? startEdit : undefined} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="vote-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>◉ 투표</span>
            {m.due && <span className="due">📅 {m.due}</span>}
          </div>
          {editMode ? (
            <div className="edit-mode" style={{ marginBottom: 10 }}>
              <input
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '7px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box' }}
                value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
                autoFocus
              />
              <div className="edit-btns">
                <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
                <button className="btn sm accent" onClick={saveEdit}>저장</button>
              </div>
            </div>
          ) : (
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{m.title}</div>
          )}
          <div className="vote-opts">
            {(m.options || []).map((opt) => {
              const count = opt.votes?.length || 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isMyVote = myVote?.id === opt.id;
              return (
                <div key={opt.id} className={'vote-opt' + (isMyVote ? ' voted' : '')} onClick={() => onVote(m.id, opt.id)}>
                  <span className="vt">{opt.text}</span>
                  <div className="vote-bar-wrap">
                    <div className="vote-bar-fill" style={{ width: pct + '%' }} />
                  </div>
                  <span className="vote-pct">{pct}%</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', minWidth: 24, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>총 {totalVotes}명 참여</div>
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function UpdateMsg({ m, onDelete, onEdit, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isMine = user?.uid && m.senderUid === user.uid;
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const startEdit = () => { setEditText(m.text || ''); setEditMode(true); };
  const saveEdit = () => {
    if (editText.trim()) onEdit?.(m.id, editText.trim());
    setEditMode(false);
  };

  return (
    <div className="msg">
      <MsgActions
        m={m}
        onEdit={isMine ? startEdit : undefined}
        onDelete={() => onDelete(m.id)}
        members={members}
        onAddTask={onAddTask}
      />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
          {m.slackTs && <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 4 }}>S</span>}
        </div>
        <div className="update-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>◆ 중간 보고</span>
          </div>
          {editMode ? (
            <div className="edit-mode">
              <textarea
                className="edit-ta"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
                rows={Math.max(3, editText.split('\n').length)}
                autoFocus
              />
              <div className="edit-btns">
                <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
                <button className="btn sm accent" onClick={saveEdit}>저장{m.slackTs ? ' (Slack 반영)' : ''}</button>
              </div>
            </div>
          ) : (
            <div className="md-content" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              <ReactMarkdown components={MD_LINK} remarkPlugins={[remarkGfm]}>{m.text || ''}</ReactMarkdown>
            </div>
          )}
          {m.progress && !editMode && (
            <div className="progress-bar-wrap">
              <div className="lbl"><span>{m.progress.label}</span><span className="mono">{m.progress.pct}%</span></div>
              <div className="progress-bar"><div className="fill" style={{ width: m.progress.pct + '%' }} /></div>
            </div>
          )}
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function AnnounceMsg({ m, onCollapse, onDelete, onEdit, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isSender = user?.uid && m.senderUid === user.uid;
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const startEdit = () => { setEditText(m.text || ''); setEditMode(true); };
  const saveEdit = () => { if (editText.trim()) onEdit?.(m.id, editText.trim()); setEditMode(false); };

  return (
    <div className="msg">
      <MsgActions m={m} onEdit={isSender ? startEdit : undefined} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="announce-card">
          <div className="an-header">
            <span className="an-icon">📢</span>
            <span className="an-label">공지사항</span>
          </div>
          {editMode ? (
            <div className="edit-mode" style={{ padding: '8px 12px' }}>
              <textarea className="edit-ta" value={editText} onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
                rows={Math.max(2, editText.split('\n').length)} autoFocus />
              <div className="edit-btns">
                <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
                <button className="btn sm accent" onClick={saveEdit}>저장</button>
              </div>
            </div>
          ) : (
            <div className="an-body md-content">
              <ReactMarkdown components={MD_LINK} remarkPlugins={[remarkGfm]}>{m.text || ''}</ReactMarkdown>
            </div>
          )}
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function fmtDuration(s) {
  if (!s) return '';
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function MeetingMsg({ m, threadOpen, onToggleThread, onSend, onSaveSummary, onDelete, senderName, members, onAddTask }) {
  const [showFull, setShowFull] = useState(false);
  const mins = m.minutes;
  const hasMinutes = mins && (mins.decisions?.length || mins.actions?.length || mins.risks?.length || mins.summary);

  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="meeting-card">
          <div className="meeting-header">
            <span>📋 회의록</span>
            {m.duration > 0 && <span className="meeting-meta mono">{fmtDuration(m.duration)}</span>}
            {m.participants?.length > 0 && <span className="meeting-meta">참석 {m.participants.length}명</span>}
          </div>
          <div className="meeting-title">{m.text}</div>

          {m.agenda?.length > 0 && (
            <div className="meeting-agenda">
              {m.agenda.map((a, i) => <span key={i} className="meeting-agenda-item">{i + 1}. {a}</span>)}
            </div>
          )}

          {hasMinutes && (
            <>
              {mins.summary && (
                <div className="meeting-summary-text">{mins.summary}</div>
              )}
              <button className="meeting-toggle-btn" onClick={() => setShowFull((v) => !v)}>
                {showFull ? '▲ 접기' : `▼ 상세 회의록 보기 (결정 ${mins.decisions?.length || 0}건 · 액션 ${mins.actions?.length || 0}건)`}
              </button>
              {showFull && (
                <div className="meeting-details">
                  {mins.decisions?.length > 0 && (
                    <div className="meeting-section">
                      <div className="meeting-section-title">📌 핵심 결정</div>
                      {mins.decisions.map((d, i) => (
                        <div key={i} className="meeting-decision">
                          <span className="meeting-dec-num">{i + 1}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{d.text}</div>
                            {d.detail && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{d.detail}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {mins.actions?.length > 0 && (
                    <div className="meeting-section">
                      <div className="meeting-section-title">✅ 액션 아이템</div>
                      {mins.actions.map((a, i) => (
                        <div key={i} className="meeting-action">
                          <span className="meeting-action-dot" />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13 }}>{a.text}</span>
                            {a.assigneeName && <span className="meeting-assignee">{a.assigneeName}</span>}
                          </div>
                          {a.due && <span className="meeting-due mono">📅 {a.due}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {mins.risks?.length > 0 && (
                    <div className="meeting-section">
                      <div className="meeting-section-title">⚠ 리스크</div>
                      {mins.risks.map((r, i) => (
                        <div key={i} className="meeting-risk">
                          <b>{r.text}</b>
                          {r.detail && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{r.detail}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {m.summary && !hasMinutes && (
            <div className="meeting-summary md-content">
              <ReactMarkdown components={MD_LINK} remarkPlugins={[remarkGfm]}>{m.summary}</ReactMarkdown>
            </div>
          )}
        </div>
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function FileMsg({ m, threadOpen, onToggleThread, onSend, onEdit, onDelete, senderName, members, onAddTask }) {
  const user = useAppStore((s) => s.user);
  const isMine = user?.uid && m.senderUid === user.uid;
  const extMap = { pdf: '📄', ai: '🎨', png: '🖼️', jpg: '🖼️', docx: '📝', xlsx: '📊', txt: '📄', md: '📄' };
  const name = m.fileName || m.file?.name || '파일';
  const size = m.fileSize || m.file?.size || '';
  const ext = name.split('.').pop().toLowerCase();
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const startEdit = () => { setEditText(m.text || ''); setEditMode(true); };
  const saveEdit = () => { onEdit?.(m.id, editText.trim()); setEditMode(false); };

  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={isMine ? startEdit : undefined} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        {editMode ? (
          <div className="edit-mode" style={{ marginBottom: 4 }}>
            <textarea
              className="edit-ta"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditMode(false); }}
              rows={Math.max(2, editText.split('\n').length)}
              placeholder="설명(캡션)을 입력하세요…"
              autoFocus
            />
            <div className="edit-btns">
              <button className="btn sm ghost" onClick={() => setEditMode(false)}>취소</button>
              <button className="btn sm accent" onClick={saveEdit}>저장</button>
            </div>
          </div>
        ) : (
          m.text && (
            <div className="msg-body">
              <p>{m.text}</p>
              {m.editedAt && <span className="edited-badge">(편집됨)</span>}
            </div>
          )
        )}
        <div className="file-card">
          <div className="file-icon">{extMap[ext] || '📎'}<br /><span style={{ fontSize: 9 }}>{ext.toUpperCase()}</span></div>
          <div>
            <div className="file-name">{name}</div>
            <div className="file-meta">{size}</div>
          </div>
          {m.fileUrl
            ? <a href={m.fileUrl} target="_blank" rel="noreferrer" className="btn minor sm file-dl">↓</a>
            : <button className="btn minor sm file-dl">↓</button>
          }
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
      </div>
    </div>
  );
}

function CasualMsg({ m, threadOpen, onToggleThread, onSend, onDelete, senderName, members, onAddTask }) {
  return (
    <div className="msg casual-msg" style={{ opacity: 0.9 }}>
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name" style={{ color: 'var(--ink-mute)' }}>{m.senderName}</span>
          <span className="ts">{m.ts}</span>
          {m.expiresAt && <DonutTimer expiresAt={m.expiresAt} />}
        </div>
        <div className="casual-card">
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{m.text}</div>
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} onSend={onSend} senderName={senderName} members={members} />}
      </div>
    </div>
  );
}

function AIMsg({ m }) {
  return (
    <div className="msg">
      <Avatar name="AI" />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name" style={{ color: 'var(--accent)' }}>Relay AI</span>
          <span className="role" style={{ color: 'var(--accent)', borderColor: 'var(--accent-line)', background: 'var(--accent-soft)' }}>AI</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="ai-card">
          <div className="ai-title">✦ {m.title}</div>
          {m.text && <div className="md-content" style={{ fontSize: 13, color: 'var(--ink-2)' }}><ReactMarkdown components={MD_LINK} remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>}
          {m.bullets && (
            <div className="ai-bullets">
              {m.bullets.map((b, i) => (
                <div key={i} className="ai-bullet">
                  <span className="k">{b.k}</span>
                  <span className="v">{b.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function TicketMsg({ m, onDelete, members, onAddTask }) {
  const pInfo = {
    '긴급': 'oklch(0.52 0.18 25)',
    '높음': 'oklch(0.52 0.16 60)',
    '보통': 'oklch(0.52 0.08 260)',
    '낮음': 'var(--ink-3)',
  };
  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="ticket-card">
          <div className="tc-hd">
            <span className="tc-code">{m.ticketCode || '티켓'}</span>
            <span className="tc-priority" style={{ color: pInfo[m.ticketPriority || '보통'] }}>
              {m.ticketPriority || '보통'}
            </span>
            <span className="tc-badge">🎫 티켓 생성</span>
          </div>
          <div className="tc-title">{m.ticketTitle || m.text}</div>
          {m.ticketDesc && <div className="tc-desc">{m.ticketDesc}</div>}
          <div className="tc-ft">
            {m.assigneeName && <span>담당 @{m.assigneeName}</span>}
            {m.dueDate && <span>📅 {m.dueDate}</span>}
            <span style={{ color: 'oklch(0.52 0.19 260)' }}>● 열림</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignMsg({ m, onDelete, members, onAddTask }) {
  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} members={members} onAddTask={onAddTask} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="assign-card">
          <div className="assign-hd">
            <span className="assign-ico">📌</span>
            <span><b>@{m.assigneeName}</b>에게 업무 할당</span>
          </div>
          <div className="assign-task">{m.text}</div>
          <div className="assign-foot">by {m.senderName}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Meeting invite card ─────────────────────────────────────────────────

function MeetingInviteMsg({ m, onRsvp }) {
  const user = useAppStore((s) => s.user);
  const uid = user?.uid;
  const rsvp = m.rsvp || {};
  const myStatus = uid ? rsvp[uid] : null;

  const scheduledAt = m.scheduledAt?.toDate
    ? m.scheduledAt.toDate()
    : m.scheduledAt ? new Date(m.scheduledAt) : null;
  const dtStr = scheduledAt
    ? scheduledAt.toLocaleString('ko', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  const agenda = (m.agenda || []).filter(Boolean);
  const attendees = (m.participants || []).filter((p) => rsvp[p.uid] === 'attend');
  const declines = (m.participants || []).filter((p) => rsvp[p.uid] === 'decline');
  const pending = (m.participants || []).filter((p) => !rsvp[p.uid]);

  const handleRsvp = (response) => {
    onRsvp(m.id, myStatus === response ? null : response);
  };

  return (
    <div className="msg">
      <Avatar name={m.senderName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="meeting-invite-card">
          <div className="mi-badge">📅 회의 초대</div>
          <div className="mi-title">{m.text}</div>
          {dtStr && <div className="mi-time">🕐 {dtStr}</div>}
          {agenda.length > 0 && (
            <div className="mi-agenda">
              {agenda.map((a, i) => (
                <span key={i} className="mi-agenda-item">{i + 1}. {a}</span>
              ))}
            </div>
          )}
          <div className="mi-rsvp-bar">
            <div className="mi-rsvp-status">
              {attendees.length > 0 && <span className="mi-rsvp-count attend">✓ {attendees.length}명 참석</span>}
              {declines.length > 0 && <span className="mi-rsvp-count decline">✗ {declines.length}명 불가</span>}
              {pending.length > 0 && <span className="mi-rsvp-count pending">⋯ {pending.length}명 미응답</span>}
            </div>
            <div className="mi-rsvp-btns">
              <button
                className={'mi-btn attend' + (myStatus === 'attend' ? ' on' : '')}
                onClick={() => handleRsvp('attend')}
              >참석</button>
              <button
                className={'mi-btn decline' + (myStatus === 'decline' ? ' on' : '')}
                onClick={() => handleRsvp('decline')}
              >불가</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Meeting alert card (sent automatically when meeting time approaches) ────

function MeetingAlertMsg({ m, onJoinMeeting }) {
  const setChatTab = useAppStore((s) => s.setChatTab);
  const setActiveLiveMeetingId = useAppStore((s) => s.setActiveLiveMeetingId);

  const handleJoin = () => {
    if (onJoinMeeting) {
      // 채팅에서 직접 회의장 입장
      onJoinMeeting(m.meetingId);
    } else {
      // fallback: KB탭 이동
      setChatTab('kb');
      setActiveLiveMeetingId(m.meetingId);
    }
  };

  return (
    <div className="msg">
      <Avatar name="Relay" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="msg-head">
          <span className="name" style={{ color: 'var(--accent)' }}>Relay</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="meeting-alert-card">
          <div className="ma-badge">⏰ 회의 알림</div>
          <div className="ma-title">{m.text}</div>
          {(m.agenda || []).filter(Boolean).length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '4px 0 8px' }}>
              {m.agenda.filter(Boolean).map((a, i) => `${i + 1}. ${a}`).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn accent sm" onClick={handleJoin}>
              ▶ 회의 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Message dispatcher ─────────────────────────────────────────────

function Message({ m, isGrouped, isGroupStart, threadOpen, handlers }) {
  const user = useAppStore((s) => s.user);
  const { toggleThread, sendReply, choose, vote, actApproval, confirmMsg, nudgeMsg, saveMeetingSummary, collapseAnnounce, editMsg, editMsgFields, deleteMsg, rsvpMeeting, addReaction, members, addTaskFromMessage, editReply, deleteReply } = handlers;

  const props = {
    m,
    isGrouped,
    isGroupStart,
    threadOpen,
    senderName: user?.name || '나',
    onToggleThread: toggleThread,
    onSend: (text) => sendReply(m.id, text),
    onChoose: choose,
    onVote: vote,
    onAct: actApproval,
    onConfirm: confirmMsg,
    onNudge: nudgeMsg,
    onSaveSummary: saveMeetingSummary,
    onCollapse: collapseAnnounce,
    onEdit: editMsg,
    onEditFields: editMsgFields,
    onDelete: deleteMsg,
    members,
    onAddTask: addTaskFromMessage,
  };

  const ctxValue = {
    uid: user?.uid,
    onReact: (emoji) => addReaction?.(m.id, emoji),
    onEditReply: (idx, text) => editReply?.(m.id, idx, text),
    onDeleteReply: (idx) => deleteReply?.(m.id, idx),
  };

  let content;
  switch (m.type) {
    case 'decision':      content = <DecisionMsg {...props} />; break;
    case 'approval':      content = <ApprovalMsg {...props} />; break;
    case 'vote':          content = <VoteMsg {...props} />; break;
    case 'update':        content = <UpdateMsg {...props} />; break;
    case 'announce':      content = <AnnounceMsg {...props} />; break;
    case 'meeting':       content = <MeetingMsg {...props} />; break;
    case 'meeting_invite':content = <MeetingInviteMsg m={m} onRsvp={rsvpMeeting} />; break;
    case 'meeting_alert': content = <MeetingAlertMsg m={m} onJoinMeeting={handlers.joinMeetingFromChat} />; break;
    case 'ticket':        content = <TicketMsg m={m} onDelete={deleteMsg} />; break;
    case 'assign':        content = <AssignMsg m={m} onDelete={deleteMsg} />; break;
    case 'image':         content = <ImageMsg {...props} />; break;
    case 'file':          content = <FileMsg {...props} />; break;
    case 'casual':        content = <CasualMsg {...props} />; break;
    case 'ai':            content = <AIMsg m={m} />; break;
    default:              content = <TextMsg {...props} />; break;
  }

  return <MsgContext.Provider value={ctxValue}>{content}</MsgContext.Provider>;
}

// handlers/threadOpen 참조가 안정적으로 유지되는 한(ChatMain 쪽 useMemo/useCallback),
// 실제로 바뀌지 않은 메시지는 여기서 리렌더가 걸러진다.
export default memo(Message);
