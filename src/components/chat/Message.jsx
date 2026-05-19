import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import useAppStore from '../../store/appStore';

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

// ─── Message type renderers ──────────────────────────────────────────────

function TextMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, senderName }) {
  return (
    <div className="msg">
      <div className="msg-actions">
        <button title="리액션">😊</button>
        <button title="답글" onClick={() => onToggleThread(m.id)}>↩</button>
        <button title="더보기">⋯</button>
      </div>
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="msg-body md-content">
          {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
          <ReactMarkdown>{m.text || ''}</ReactMarkdown>
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
      </div>
    </div>
  );
}

function DecisionMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onChoose, senderName }) {
  return (
    <div className="msg">
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
          <div className="dc-desc">{m.desc}</div>
          <div className="dc-options">
            {(m.options || []).map((opt) => (
              <div key={opt.letter} className={'dc-opt' + (m.chosen === opt.letter ? ' chosen' : '')} onClick={() => onChoose(m.id, opt.letter)}>
                <div className="letter">{opt.letter}</div>
                <div className="title">{opt.title}</div>
                <div className="sub">{opt.sub}</div>
              </div>
            ))}
          </div>
          {m.chosen && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--emerald)', fontWeight: 600 }}>✓ {m.chosen}안 선택됨</p>}
        </div>
        <Reactions list={m.reactions} />
        <ThreadToggle count={m.thread?.length} hasNew={m.threadHasNew} open={threadOpen} onClick={() => onToggleThread(m.id)} />
        {threadOpen && <Thread items={m.thread || []} replyValue={replyValue} onReplyChange={onReplyChange} onSend={onSend} senderName={senderName} />}
      </div>
    </div>
  );
}

function ApprovalMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onAct, senderName }) {
  const { user } = useAppStore();
  const isLead = user?.role === 'lead';
  const [holdDate, setHoldDate] = useState('');
  const [showHoldPicker, setShowHoldPicker] = useState(false);

  const statusClass = m.status === 'approved' ? 'approved' : m.status === 'rejected' ? 'rejected' : m.status === 'held' ? 'held' : '';

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
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className={'approval-card ' + statusClass}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'oklch(0.42 0.13 70)', fontWeight: 700 }}>✓ 승인 요청</span>
            {m.importance > 0 && <span className="imp">{'⭐'.repeat(m.importance)}</span>}
            {m.due && <span className="due urgent">📅 {m.due}</span>}
          </div>
          <div className="ac-desc md-content">
            <ReactMarkdown>{m.text || ''}</ReactMarkdown>
          </div>
          <div className="ac-actions">
            {m.status === 'pending' && isLead ? (
              <>
                <button className="btn accent sm" onClick={() => onAct(m.id, 'approve')}>승인</button>
                <button className="btn danger sm" onClick={() => onAct(m.id, 'reject')}>반려</button>
                <button className="btn minor sm" onClick={handleHold}>보류</button>
                {showHoldPicker && (
                  <div className="hold-picker">
                    <input type="date" value={holdDate} onChange={(e) => setHoldDate(e.target.value)} />
                    <button className="btn accent sm" onClick={handleHold}>확인</button>
                  </div>
                )}
              </>
            ) : m.status === 'pending' ? (
              <span className="ac-status pending">⏳ 검토 대기 중</span>
            ) : m.status === 'held' ? (
              <span className="ac-status held">⏸ 보류{m.heldUntil ? ` (${m.heldUntil}까지)` : ''}</span>
            ) : (
              <span className={'ac-status ' + m.status}>
                {m.status === 'approved' ? '✓ 승인 완료' : '✗ 반려됨'}
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

function VoteMsg({ m, onVote }) {
  return (
    <div className="msg">
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="vote-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>🗳️ 투표</span>
            {m.due && <span className="due">📅 {m.due}</span>}
          </div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{m.title}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>{m.desc}</div>
          <div className="vote-opts">
            {(m.options || []).map((opt) => (
              <div key={opt.id} className={'vote-opt' + (opt.voted ? ' voted' : '')} onClick={() => onVote(m.id, opt.id)}>
                <span className="vt">{opt.text}</span>
                <div className="voters">
                  {(opt.votes || []).slice(0, 5).map((v, i) => (
                    <div key={i} className="av" style={{ width: 20, height: 20, fontSize: 8, background: v.color || 'oklch(0.5 0.2 270)', marginRight: -4, border: '1px solid var(--surface)' }}>
                      {v.name}
                    </div>
                  ))}
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{opt.votes?.length || 0}</span>
              </div>
            ))}
          </div>
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function UpdateMsg({ m }) {
  return (
    <div className="msg">
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
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{m.title}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{m.desc}</div>
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

function AnnounceMsg({ m }) {
  return (
    <div className="msg">
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="announce-card">
          <div className="an-icon">📢</div>
          <div className="an-title">{m.title}</div>
          <div className="an-desc">{m.desc}</div>
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function FileMsg({ m }) {
  const extMap = { pdf: '📄', ai: '🎨', png: '🖼️', jpg: '🖼️', docx: '📝', xlsx: '📊', txt: '📄', md: '📄' };
  const ext = m.file?.name?.split('.').pop() || 'file';
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
            <div className="file-name">{m.file?.name}</div>
            <div className="file-meta">{m.file?.size}</div>
          </div>
          <button className="btn minor sm file-dl">↓</button>
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function CasualMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, senderName }) {
  const [now, setNow] = useState(Date.now());
  const left = m.expiresAt ? Math.max(0, m.expiresAt - now) : null;
  const pct = left !== null ? Math.min(100, (left / (60 * 60 * 1000)) * 100) : 100;
  const mm = left !== null ? Math.floor(left / 60000) : null;

  return (
    <div className="msg" style={{ opacity: 0.9 }}>
      <Avatar name={m.senderName} />
      <div style={{ flex: 1 }}>
        <div className="msg-head">
          <span className="name">{m.senderName}</span>
          <span className="role">{m.senderRole}</span>
          <span className="ts">{m.ts}</span>
        </div>
        <div className="casual-card">
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{m.text}</div>
          {left !== null && (
            <div className="casual-timer">
              <span>☕</span>
              <div className="casual-bar"><div className="fill" style={{ width: pct + '%' }} /></div>
              <span>{mm}분 남음</span>
            </div>
          )}
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
          {m.text && <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{m.text}</div>}
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

// ─── Main Message dispatcher ─────────────────────────────────────────────

export default function Message({ m, handlers }) {
  const { user } = useAppStore();
  const { openThreads, replyValues, toggleThread, setReplyValue, sendReply, choose, vote, actApproval } = handlers;
  const threadOpen = openThreads.has(m.id);
  const replyValue = replyValues[m.id] || '';

  const props = {
    m,
    threadOpen,
    replyValue,
    senderName: user?.name || '나',
    onToggleThread: toggleThread,
    onReplyChange: (v) => setReplyValue(m.id, v),
    onSend: () => sendReply(m.id),
    onChoose: choose,
    onVote: vote,
    onAct: actApproval,
  };

  switch (m.type) {
    case 'decision':  return <DecisionMsg {...props} />;
    case 'approval':  return <ApprovalMsg {...props} />;
    case 'vote':      return <VoteMsg {...props} />;
    case 'update':    return <UpdateMsg m={m} />;
    case 'announce':  return <AnnounceMsg m={m} />;
    case 'file':      return <FileMsg m={m} />;
    case 'casual':    return <CasualMsg {...props} />;
    case 'ai':        return <AIMsg m={m} />;
    default:          return <TextMsg {...props} />;
  }
}
