import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import useAppStore from '../../store/appStore';
import { claudeComplete } from '../../lib/claude';

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

function MsgActions({ m, onReply, onEdit, onDelete }) {
  const { user } = useAppStore();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);
  const isMine = user?.uid && m.senderUid === user.uid;

  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  return (
    <div className="msg-actions">
      <button title="리액션">😊</button>
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
          </div>
        )}
      </div>
    </div>
  );
}

function Reactions({ list }) {
  if (!list || list.length === 0) return null;
  return (
    <div className="rx-row">
      {list.map((r, i) => (
        <button key={i} className={'rx' + (r.mine ? ' mine' : '')}>{r.e} {r.n}</button>
      ))}
      <button className="rx-add">+</button>
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

function Thread({ items, replyValue, onReplyChange, onSend, senderName }) {
  return (
    <div className="thread">
      {items.map((t, i) => (
        <div className="msg" key={i}>
          <Avatar name={t.senderName || t.from} size={28} />
          <div>
            <div className="msg-head">
              <span className="name" style={{ fontSize: 13 }}>{t.senderName || t.from}</span>
              <span className="ts">{t.ts}</span>
              {t.isNew && <span className="thread-new">NEW</span>}
            </div>
            <div className="msg-body" style={{ fontSize: 13 }}>{t.text}</div>
          </div>
        </div>
      ))}
      <div className="thread-reply">
        <Avatar name={senderName} size={28} />
        <input
          placeholder="스레드에 답글…"
          value={replyValue}
          onChange={(e) => onReplyChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && replyValue.trim()) onSend(); }}
        />
        <button className="btn sm accent" onClick={() => replyValue.trim() && onSend()}>전송</button>
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

function TextMsg({ m, isGrouped, isGroupStart, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onConfirm, onNudge, onEdit, onDelete, senderName }) {
  const { user } = useAppStore();
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
          <ReactMarkdown components={MD_LINK}>{m.text || ''}</ReactMarkdown>
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
      {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
    </>
  );

  // Grouped: same sender, no avatar/header repeated
  if (isGrouped) {
    return (
      <div className={'msg grouped' + (m.importance > 0 ? ' importance-msg imp-' + m.importance : '') + (isGroupStart ? ' group-start' : '')}>
        <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={startEdit} onDelete={() => onDelete(m.id)} />
        <div className="msg-grouped-spacer" />
        <div style={{ flex: 1 }}>{body}</div>
      </div>
    );
  }

  const cls = 'msg' + (m.importance > 0 ? ' importance-msg imp-' + m.importance : '') + (isGroupStart ? ' group-start' : '');
  return (
    <div className={cls}>
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onEdit={startEdit} onDelete={() => onDelete(m.id)} />
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

function DecisionMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onChoose, onDelete, senderName }) {
  const { user } = useAppStore();
  const isLead = user?.role === 'lead';
  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onDelete={() => onDelete(m.id)} />
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
            {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
            {m.due && <span className="due">📅 {m.due}</span>}
          </div>
          <div className="dc-header">{m.title}</div>
          <div className="dc-options">
            {(m.options || []).map((opt) => (
              <div
                key={opt.letter}
                className={'dc-opt' + (m.chosen === opt.letter ? ' chosen' : '') + (!isLead && !m.chosen ? ' locked' : '')}
                style={!isLead && !m.chosen ? { cursor: 'default', opacity: 0.6 } : {}}
                onClick={() => !m.chosen && isLead && onChoose(m.id, opt.letter)}
              >
                <div className="letter">{opt.letter}</div>
                <div className="title">{opt.title}</div>
              </div>
            ))}
          </div>
          {!m.chosen && !isLead && <p style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-3)' }}>⏳ 팀장이 결정합니다</p>}
          {m.chosen && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--emerald)', fontWeight: 600 }}>✓ {m.chosen}안 선택됨</p>}
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
      </div>
    </div>
  );
}

function ApprovalMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onAct, onDelete, senderName }) {
  const { user } = useAppStore();
  const isLead = user?.role === 'lead';
  const [holdDate, setHoldDate] = useState('');
  const [showHoldPicker, setShowHoldPicker] = useState(false);

  const status = m.status || 'pending';
  const isPending = status === 'pending';
  const statusClass = status === 'approved' ? 'approved' : status === 'done' ? 'done' : status === 'held' ? 'held' : '';

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
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onDelete={() => onDelete(m.id)} />
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
            {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
          </div>
          <div className="ac-desc md-content">
            <ReactMarkdown components={MD_LINK}>{m.text || ''}</ReactMarkdown>
          </div>
          <div className="ac-actions">
            {isPending ? (
              isLead ? (
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
                <span className="ac-status" style={{ color: 'var(--ink-3)', fontSize: 12 }}>⏳ 팀장 검토 대기 중</span>
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
        {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
      </div>
    </div>
  );
}

function ImageMsg({ m }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg">
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
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
      </div>
    </div>
  );
}

function VoteMsg({ m, onVote, onDelete }) {
  const { user } = useAppStore();
  const totalVotes = (m.options || []).reduce((sum, o) => sum + (o.votes?.length || 0), 0);
  const myVote = (m.options || []).find((o) => (o.votes || []).some((v) => v.uid === user?.uid || v.name === user?.name));

  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} />
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
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{m.title}</div>
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

function UpdateMsg({ m, onDelete }) {
  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="update-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>◆ 중간 보고</span>
          </div>
          <div className="md-content" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            <ReactMarkdown components={MD_LINK}>{m.text || ''}</ReactMarkdown>
          </div>
          {m.progress && (
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

function AnnounceMsg({ m, onCollapse, onDelete }) {
  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} />
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
          <div className="an-body md-content">
            <ReactMarkdown components={MD_LINK}>{m.text || ''}</ReactMarkdown>
          </div>
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function MeetingMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onSaveSummary, onDelete, senderName }) {
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const threadText = (m.thread || []).map((t) => `${t.senderName || t.from}: ${t.text}`).join('\n');
      const prompt = `다음은 팀 회의 내용입니다. 아래 항목으로 정리해주세요:\n\n회의 제목: ${m.text || '(제목 없음)'}\n\n발언 내용:\n${threadText || '(발언 없음)'}\n\n아래 형식으로 출력해주세요:\n\n**안건 정리**\n- \n\n**결정이 필요한 사항**\n- \n\n**확정된 사항**\n- \n\n**회의 요약**\n(2~3문장)\n\n**회의 문화 평가**\n점수: X/100점\n- 상사에 대한 말투:\n- 지적·대들기 여부:\n- 전반적인 회의 문화:`;
      const result = await claudeComplete(prompt, '당신은 팀 업무 관리 AI입니다. 간결하고 명확하게 한국어로 답변하세요.');
      onSaveSummary(m.id, result);
    } catch (e) {
      console.error(e);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="msg">
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onDelete={() => onDelete(m.id)} />
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="meeting-card">
          <div className="meeting-header">
            <span>📋 회의</span>
          </div>
          <div className="meeting-title">{m.text}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className={'btn sm' + (summarizing ? ' minor' : ' accent')} onClick={handleSummarize} disabled={summarizing}>
              {summarizing ? <><span className="ai-typing"><span /><span /><span /></span> 요약 중…</> : '✦ AI 회의 요약'}
            </button>
          </div>
          {m.summary && (
            <div className="meeting-summary md-content">
              <ReactMarkdown components={MD_LINK}>{m.summary}</ReactMarkdown>
            </div>
          )}
        </div>
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function FileMsg({ m }) {
  const extMap = { pdf: '📄', ai: '🎨', png: '🖼️', jpg: '🖼️', docx: '📝', xlsx: '📊', txt: '📄', md: '📄' };
  const name = m.fileName || m.file?.name || '파일';
  const size = m.fileSize || m.file?.size || '';
  const ext = name.split('.').pop().toLowerCase();
  return (
    <div className="msg">
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        {m.text && <div className="msg-body"><p>{m.text}</p></div>}
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
      </div>
    </div>
  );
}

function CasualMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onDelete, senderName }) {
  return (
    <div className="msg casual-msg" style={{ opacity: 0.9 }}>
      <MsgActions m={m} onReply={() => onToggleThread(m.id)} onDelete={() => onDelete(m.id)} />
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
        {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
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
          {m.text && <div className="md-content" style={{ fontSize: 13, color: 'var(--ink-2)' }}><ReactMarkdown components={MD_LINK}>{m.text}</ReactMarkdown></div>}
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

function TicketMsg({ m, onDelete }) {
  const pInfo = {
    '긴급': 'oklch(0.52 0.18 25)',
    '높음': 'oklch(0.52 0.16 60)',
    '보통': 'oklch(0.52 0.08 260)',
    '낮음': 'var(--ink-3)',
  };
  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} />
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

function AssignMsg({ m, onDelete }) {
  return (
    <div className="msg">
      <MsgActions m={m} onDelete={() => onDelete(m.id)} />
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

// ─── Main Message dispatcher ─────────────────────────────────────────────

export default function Message({ m, isGrouped, handlers }) {
  const { user } = useAppStore();
  const { openThreads, replyValues, toggleThread, setReplyValue, sendReply, choose, vote, actApproval, confirmMsg, nudgeMsg, saveMeetingSummary, collapseAnnounce, editMsg, deleteMsg } = handlers;
  const threadOpen = openThreads.has(m.id);
  const replyValue = replyValues[m.id] || '';

  const props = {
    m,
    isGrouped,
    threadOpen,
    replyValue,
    senderName: user?.name || '나',
    onToggleThread: toggleThread,
    onReplyChange: (v) => setReplyValue(m.id, v),
    onSend: () => sendReply(m.id),
    onChoose: choose,
    onVote: vote,
    onAct: actApproval,
    onConfirm: confirmMsg,
    onNudge: nudgeMsg,
    onSaveSummary: saveMeetingSummary,
    onCollapse: collapseAnnounce,
    onEdit: editMsg,
    onDelete: deleteMsg,
  };

  switch (m.type) {
    case 'decision':  return <DecisionMsg {...props} />;
    case 'approval':  return <ApprovalMsg {...props} />;
    case 'vote':      return <VoteMsg {...props} />;
    case 'update':    return <UpdateMsg {...props} />;
    case 'announce':  return <AnnounceMsg {...props} />;
    case 'meeting':   return <MeetingMsg {...props} />;
    case 'ticket':    return <TicketMsg m={m} onDelete={deleteMsg} />;
    case 'assign':    return <AssignMsg m={m} onDelete={deleteMsg} />;
    case 'image':     return <ImageMsg m={m} />;
    case 'file':      return <FileMsg m={m} />;
    case 'casual':    return <CasualMsg {...props} />;
    case 'ai':        return <AIMsg m={m} />;
    default:          return <TextMsg {...props} />;
  }
}
