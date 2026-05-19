import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import useAppStore from '../../store/appStore';
import { claudeComplete } from '../../lib/claude';

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

function TextMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onConfirm, onNudge, senderName }) {
  const { user } = useAppStore();
  const isSender = user?.uid && m.senderUid === user.uid;
  const confirmed = m.confirmedBy?.includes(user?.uid);
  const [nudgeSent, setNudgeSent] = useState(false);

  const handleNudge = () => {
    onNudge(m.id);
    setNudgeSent(true);
    setTimeout(() => setNudgeSent(false), 3000);
  };

  const content = (
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
      {m.importance > 0 && (
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
    </div>
  );

  if (m.importance > 0) {
    return (
      <div className={'msg importance-msg imp-' + m.importance}>
        <div className="msg-actions">
          <button title="리액션">😊</button>
          <button title="답글" onClick={() => onToggleThread(m.id)}>↩</button>
          <button title="더보기">⋯</button>
        </div>
        <Avatar name={m.senderName} />
        {content}
      </div>
    );
  }

  return (
    <div className="msg">
      <div className="msg-actions">
        <button title="리액션">😊</button>
        <button title="답글" onClick={() => onToggleThread(m.id)}>↩</button>
        <button title="더보기">⋯</button>
      </div>
      <Avatar name={m.senderName} />
      {content}
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
          <div className="dc-options">
            {(m.options || []).map((opt) => (
              <div key={opt.letter} className={'dc-opt' + (m.chosen === opt.letter ? ' chosen' : '')} onClick={() => !m.chosen && onChoose(m.id, opt.letter)}>
                <div className="letter">{opt.letter}</div>
                <div className="title">{opt.title}</div>
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
  const { user } = useAppStore();
  const totalVotes = (m.options || []).reduce((sum, o) => sum + (o.votes?.length || 0), 0);
  const myVote = (m.options || []).find((o) => (o.votes || []).some((v) => v.uid === user?.uid || v.name === user?.name));

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
          <div className="md-content" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            <ReactMarkdown>{m.text || ''}</ReactMarkdown>
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

function AnnounceMsg({ m, onCollapse }) {
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
          <div className="an-header">
            <span className="an-icon">📢</span>
            <span className="an-label">공지사항</span>
          </div>
          <div className="an-body md-content">
            <ReactMarkdown>{m.text || ''}</ReactMarkdown>
          </div>
        </div>
        <Reactions list={m.reactions} />
      </div>
    </div>
  );
}

function MeetingMsg({ m, threadOpen, replyValue, onToggleThread, onReplyChange, onSend, onSaveSummary, senderName }) {
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
              <ReactMarkdown>{m.summary}</ReactMarkdown>
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
  return (
    <div className="msg casual-msg" style={{ opacity: 0.9 }}>
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
          {m.text && <div className="md-content" style={{ fontSize: 13, color: 'var(--ink-2)' }}><ReactMarkdown>{m.text}</ReactMarkdown></div>}
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
  const { openThreads, replyValues, toggleThread, setReplyValue, sendReply, choose, vote, actApproval, confirmMsg, nudgeMsg, saveMeetingSummary, collapseAnnounce } = handlers;
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
    onConfirm: confirmMsg,
    onNudge: nudgeMsg,
    onSaveSummary: saveMeetingSummary,
    onCollapse: collapseAnnounce,
  };

  switch (m.type) {
    case 'decision':  return <DecisionMsg {...props} />;
    case 'approval':  return <ApprovalMsg {...props} />;
    case 'vote':      return <VoteMsg {...props} />;
    case 'update':    return <UpdateMsg m={m} />;
    case 'announce':  return <AnnounceMsg {...props} />;
    case 'meeting':   return <MeetingMsg {...props} />;
    case 'file':      return <FileMsg m={m} />;
    case 'casual':    return <CasualMsg {...props} />;
    case 'ai':        return <AIMsg m={m} />;
    default:          return <TextMsg {...props} />;
  }
}
