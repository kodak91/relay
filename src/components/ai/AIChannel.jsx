import { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { claudeComplete } from '../../lib/claude';
import { useMessages } from '../../hooks/useMessages';
import { useTasks } from '../../hooks/useTasks';
import { useTickets } from '../../hooks/useTickets';
import { useMeetings } from '../../hooks/useMeetings';
import { useKB } from '../../hooks/useKB';
import { useProjects } from '../../hooks/useProjects';
import useAppStore from '../../store/appStore';
import { addDoc, updateDoc, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const PM_MODEL = 'claude-sonnet-5';

const PM_SYSTEM = `당신은 Relay 팀 협업 플랫폼의 AI PM(Project Manager) 어시스턴트입니다.
프로젝트의 채팅 메시지, 태스크, 티켓, 회의, 파일 등 모든 리소스 데이터가 아래 컨텍스트에 포함됩니다.

== 핵심 역할 ==
1. 팀 현황 파악 및 분석 (지연, 위험, 우선순위)
2. 데이터 기반으로 질문에 정확히 답변
3. 필요시 태스크·티켓·메시지·회의를 직접 생성/수정

== 작업 실행 ==
실행 가능한 작업을 제안할 때 응답 맨 끝에 정확히 다음 형식 한 줄 추가:
RELAY_ACTION:{"type":"...","params":{...},"reason":"..."}

지원 액션 타입 및 params:
- create_task: {title, assigneeUid, assigneeName, due}
- update_task: {taskId, done(bool), title}
- create_ticket: {title, description, assigneeUid, assigneeName, priority, dueDate}
- update_ticket: {ticketId, status, priority, assigneeUid, assigneeName}
- send_message: {text, type} (type: "text" 또는 "announce")
- schedule_meeting: {title, scheduledAt(ISO 8601), agenda(배열), participantUids(배열)}

사용자가 명시적으로 요청하거나 명확히 필요하다고 판단될 때만 액션을 포함하세요.
항상 한국어로 간결하게 답변하세요.`;

const COMMANDS = [
  { cmd: '/현황', desc: '프로젝트 전체 현황 요약' },
  { cmd: '/위험', desc: '지연·미배정·막힌 항목 분석' },
  { cmd: '/오늘', desc: '오늘 할 일 & 결정 대기' },
  { cmd: '/회의준비', desc: '미결 항목 기반 안건 제안' },
];

const COMMAND_QUERIES = {
  '/현황': '현재 프로젝트 전체 현황을 PM 관점에서 요약해줘. 완료율, 지연 항목, 대기 중인 결정/승인, 이번 주 마감 태스크를 포함해서.',
  '/위험': '현재 위험 항목을 분석해줘. 마감 지난 태스크, 담당자 없는 티켓, 대기 중인 승인, 막힌 이슈를 리스트로.',
  '/오늘': '오늘 처리해야 할 항목을 알려줘. 오늘 마감 태스크, 결정 대기 중인 항목, 오늘 예정 회의를 포함해서.',
  '/회의준비': '다음 팀 회의 안건을 제안해줘. 미결 결정사항, 지연 항목, 이번 주 완료 사항을 기반으로 구조화된 안건을 작성해.',
};

const ACTION_LABELS = {
  create_task: '태스크 생성',
  update_task: '태스크 업데이트',
  create_ticket: '티켓 생성',
  update_ticket: '티켓 업데이트',
  send_message: '채팅 메시지 전송',
  schedule_meeting: '회의 예약',
};

const PARAM_LABELS = {
  title: '제목', assigneeUid: '담당자 UID', assigneeName: '담당자',
  due: '마감일', done: '완료 여부', taskId: '태스크 ID',
  description: '설명', priority: '우선순위', dueDate: '마감일',
  ticketId: '티켓 ID', status: '상태', text: '내용', type: '유형',
  scheduledAt: '일시', agenda: '안건', participantUids: '참석자 UID',
};

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function parseAction(responseText) {
  const match = responseText.match(/RELAY_ACTION:(\{[\s\S]*?\})\s*$/m);
  if (!match) return { text: responseText, action: null };
  try {
    const action = JSON.parse(match[1]);
    const text = responseText.slice(0, match.index).trim();
    return { text, action };
  } catch {
    return { text: responseText, action: null };
  }
}

// ─── 액션 확인 카드 ────────────────────────────────────────────────────────────

function ActionCard({ action, onConfirm, onCancel, done }) {
  const label = ACTION_LABELS[action.type] || action.type;
  return (
    <div className={'ai-action-card' + (done ? ' done' : '')}>
      <div className="ai-action-hd">
        <span className="ai-action-type">{label}</span>
        {done && <span className="ai-action-done">✓ 실행됨</span>}
      </div>
      <div className="ai-action-params">
        {Object.entries(action.params || {})
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => (
            <div key={k} className="ai-action-row">
              <span className="ai-action-key">{PARAM_LABELS[k] || k}</span>
              <span className="ai-action-val">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
            </div>
          ))}
      </div>
      {action.reason && <div className="ai-action-reason">{action.reason}</div>}
      {!done && (
        <div className="ai-action-btns">
          <button className="btn accent sm" onClick={onConfirm}>✓ 실행</button>
          <button className="btn sm" onClick={onCancel}>취소</button>
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AIChannel() {
  const { activeProject, user } = useAppStore();
  const { messages } = useMessages(activeProject);
  const { tasks } = useTasks(activeProject);
  const { tickets } = useTickets(activeProject);
  const { meetings } = useMeetings(activeProject);
  const { files } = useKB(activeProject);
  const { projects } = useProjects(user?.uid);

  const currentProject = useMemo(() => projects.find((p) => p.id === activeProject), [projects, activeProject]);
  const members = currentProject?.members || [];

  const [chatHistory, setChatHistory] = useState([
    {
      role: 'ai',
      text: `안녕하세요! **Relay AI PM**입니다.\n\n채팅, 태스크, 티켓, 회의, 파일 등 프로젝트 전체 데이터에 접근할 수 있습니다. 태스크 생성, 티켓 업데이트, 채팅 전송, 회의 예약도 제가 직접 실행할 수 있어요.\n\n아래 명령어로 시작하거나 자유롭게 질문하세요.`,
      ts: nowHM(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState({});
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  const buildContext = () => {
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });

    const membersList = members
      .filter((m) => m.uid)
      .map((m) => `${m.name}(${m.role || '멤버'}, uid:${m.uid})`)
      .join(', ');

    // 모든 메시지 (최근 100개, 전체 유형)
    const msgLines = messages.slice(-100).map((m) => {
      const typeLabel = {
        text: '일반', approval: '컨펌', decision: '결정', vote: '투표',
        update: '보고', announce: '공지', meeting: '회의', assign: '할당', ticket: '티켓',
      }[m.type] || m.type;
      const status = m.status ? `·${m.status}` : '';
      const chosen = m.chosen ? `·선택:${m.chosen}` : '';
      const content = (m.text || m.title || m.meetingTitle || '').slice(0, 120);
      return `[${typeLabel}${status}${chosen}] ${m.ts || ''} ${m.senderName}: ${content}`;
    }).join('\n');

    // 전체 태스크 (완료 포함)
    const taskLines = tasks.map((t) =>
      `[${t.done ? '✓' : '○'}] id:${t.id} ${t.title}${t.assigneeName ? ` | ${t.assigneeName}` : ''}${t.due ? ` | 마감:${t.due}` : ''}`
    ).join('\n');

    // 전체 티켓
    const ticketLines = tickets.map((t) =>
      `[${t.status || '열림'}] ${t.ticketCode || ''} id:${t.id} ${t.title}${t.assigneeName ? ` | ${t.assigneeName}` : ''}${t.priority ? ` | ${t.priority}` : ''}${t.dueDate ? ` | 마감:${t.dueDate}` : ''}`
    ).join('\n');

    // 회의
    const upcomingMtg = meetings.filter((m) => m.status === 'scheduled').map((m) => {
      const d = m.scheduledAt?.toDate ? m.scheduledAt.toDate().toLocaleString('ko-KR') : '일시 미정';
      return `[예정] ${d}: ${m.title} | ${(m.participants || []).map((p) => p.name).join(', ')}`;
    }).join('\n');

    const doneMtg = meetings.filter((m) => m.status === 'done').slice(-5).map((m) => {
      const d = m.endedAt?.toDate ? m.endedAt.toDate().toLocaleDateString('ko-KR') : '';
      const summary = m.minutes?.summary?.slice(0, 100) || '';
      const decisions = (m.minutes?.decisions || []).slice(0, 3).map((d) => d.text).join(', ');
      return `[완료] ${d}: ${m.title} | 요약:${summary}${decisions ? ` | 결정:${decisions}` : ''}`;
    }).join('\n');

    // KB 파일 목록
    const fileLines = (files || []).slice(0, 50).map((f) =>
      `${f.name} | 담당:${f.uploader || ''} | ${f.date || ''}`
    ).join('\n');

    return `=== RELAY PM 컨텍스트 ===
프로젝트: ${currentProject?.name || activeProject}
오늘: ${today}
팀 멤버: ${membersList || '(없음)'}

=== 채팅 메시지 (최근 100개) ===
${msgLines || '(없음)'}

=== 태스크 전체 (${tasks.length}개) ===
${taskLines || '(없음)'}

=== 티켓 전체 (${tickets.length}개) ===
${ticketLines || '(없음)'}

=== 예정 회의 ===
${upcomingMtg || '(없음)'}

=== 회의록 (최근 5개) ===
${doneMtg || '(없음)'}

=== KB 파일 목록 (${(files || []).length}개) ===
${fileLines || '(없음)'}`;
  };

  const buildHistory = () => {
    return chatHistory
      .slice(-8)
      .map((m) => `${m.role === 'user' ? '사용자' : 'Relay AI'}: ${m.text}`)
      .join('\n\n');
  };

  const executeAction = async (action) => {
    const { type, params } = action;
    const nowHMStr = nowHM();
    switch (type) {
      case 'create_task':
        await addDoc(collection(db, 'projects', activeProject, 'tasks'), {
          title: params.title,
          assigneeUid: params.assigneeUid || null,
          assigneeName: params.assigneeName || null,
          due: params.due || null,
          done: false,
          fromAI: true,
          createdAt: serverTimestamp(),
        });
        break;
      case 'update_task':
        await updateDoc(doc(db, 'projects', activeProject, 'tasks', params.taskId), {
          ...(params.done !== undefined && { done: params.done }),
          ...(params.title && { title: params.title }),
        });
        break;
      case 'create_ticket': {
        const ticketCode = `T-${String(tickets.length + 1).padStart(3, '0')}`;
        await addDoc(collection(db, 'projects', activeProject, 'tickets'), {
          ticketCode,
          title: params.title,
          description: params.description || '',
          assigneeUid: params.assigneeUid || null,
          assigneeName: params.assigneeName || null,
          priority: params.priority || '보통',
          status: '열림',
          dueDate: params.dueDate || null,
          fromAI: true,
          createdAt: serverTimestamp(),
        });
        break;
      }
      case 'update_ticket':
        await updateDoc(doc(db, 'projects', activeProject, 'tickets', params.ticketId), {
          ...(params.status && { status: params.status }),
          ...(params.priority && { priority: params.priority }),
          ...(params.assigneeUid !== undefined && { assigneeUid: params.assigneeUid }),
          ...(params.assigneeName !== undefined && { assigneeName: params.assigneeName }),
        });
        break;
      case 'send_message':
        await addDoc(collection(db, 'projects', activeProject, 'messages'), {
          type: params.type || 'text',
          text: params.text,
          senderName: 'Relay AI',
          senderUid: 'relay-ai',
          senderRole: 'AI',
          ts: nowHMStr,
          tags: [],
          createdAt: serverTimestamp(),
          thread: [],
          reactions: [],
        });
        break;
      case 'schedule_meeting': {
        const participantMembers = (params.participantUids || []).map((uid) => {
          const m = members.find((m) => m.uid === uid);
          return { uid, name: m?.name || uid };
        });
        await addDoc(collection(db, 'projects', activeProject, 'meetings'), {
          title: params.title,
          scheduledAt: params.scheduledAt ? new Date(params.scheduledAt) : null,
          agenda: params.agenda || [],
          participants: participantMembers,
          createdBy: { uid: 'relay-ai', name: 'Relay AI' },
          status: 'scheduled',
          createdAt: serverTimestamp(),
        });
        break;
      }
      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  };

  const handleConfirmAction = async (msgIdx) => {
    const msg = chatHistory[msgIdx];
    if (!msg?.action) return;
    try {
      await executeAction(msg.action);
      setChatHistory((h) => h.map((m, i) => i === msgIdx ? { ...m, actionDone: true } : m));
      setPendingActions((prev) => { const n = { ...prev }; delete n[msgIdx]; return n; });
      setChatHistory((h) => [...h, {
        role: 'ai', ts: nowHM(),
        text: `✓ **${ACTION_LABELS[msg.action.type]}** 완료되었습니다.`,
      }]);
    } catch (e) {
      setChatHistory((h) => [...h, {
        role: 'ai', ts: nowHM(),
        text: `실행 중 오류가 발생했습니다: ${e.message}`,
        error: true,
      }]);
    }
  };

  const handleCancelAction = (msgIdx) => {
    setChatHistory((h) => h.map((m, i) => i === msgIdx ? { ...m, actionCancelled: true } : m));
  };

  const handleSend = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', text, ts: nowHM() };
    setChatHistory((h) => [...h, userMsg]);
    setLoading(true);

    try {
      const ctx = buildContext();
      const history = buildHistory();
      const query = COMMAND_QUERIES[text] || text;
      const prompt = `${ctx}\n\n=== 대화 내역 ===\n${history}\n\n사용자: ${query}`;

      const result = await claudeComplete(prompt, PM_SYSTEM, PM_MODEL);
      const { text: aiText, action } = parseAction(result);

      const aiMsg = { role: 'ai', text: aiText, ts: nowHM(), action: action || null };
      setChatHistory((h) => [...h, aiMsg]);
    } catch (err) {
      setChatHistory((h) => [...h, {
        role: 'ai', ts: nowHM(),
        text: `AI 연결에 실패했습니다. (${err.message})`,
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="col-mid ai-channel-view">
      {/* 헤더 */}
      <div className="chat-head" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }}>
        <span className="ai-dot" />
        <span style={{ fontWeight: 700, color: 'var(--accent)', marginLeft: 8 }}>Relay AI</span>
        <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.7, marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
          Claude Sonnet · PM 모드
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
          메시지 {messages.length} · 태스크 {tasks.length} · 티켓 {tickets.length}
        </span>
      </div>

      {/* 채팅 영역 */}
      <div className="ai-chat-scroll" ref={scrollRef}>
        {chatHistory.map((msg, i) => (
          <div key={i} className={'ai-msg ' + msg.role}>
            {msg.role === 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div className="av" style={{ width: 24, height: 24, background: 'oklch(0.45 0.20 280)', fontSize: 10 }}>✦</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Relay AI</span>
                <span className="ai-msg-ts">{msg.ts}</span>
              </div>
            )}
            <div
              className={'ai-msg-bubble' + (msg.error ? ' error' : '')}
              style={msg.error ? { background: 'var(--rose-bg)', color: 'var(--rose)', border: '1px solid var(--rose-line)' } : {}}
            >
              {msg.role === 'ai' && !msg.error
                ? <div className="md-content ai-md"><ReactMarkdown>{msg.text}</ReactMarkdown></div>
                : <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.text}</pre>
              }
            </div>
            {/* 액션 카드 */}
            {msg.role === 'ai' && msg.action && !msg.actionCancelled && (
              <ActionCard
                action={msg.action}
                done={!!msg.actionDone}
                onConfirm={() => handleConfirmAction(i)}
                onCancel={() => handleCancelAction(i)}
              />
            )}
            {msg.role === 'user' && <span className="ai-msg-ts" style={{ alignSelf: 'flex-end' }}>{msg.ts}</span>}
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div className="av" style={{ width: 24, height: 24, background: 'oklch(0.45 0.20 280)', fontSize: 10 }}>✦</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Relay AI</span>
            </div>
            <div className="ai-msg-bubble" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="ai-typing"><span /><span /><span /></span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>분석 중…</span>
            </div>
          </div>
        )}
      </div>

      {/* 명령어 칩 */}
      <div className="ai-commands">
        {COMMANDS.map((c) => (
          <button key={c.cmd} className="ai-cmd-chip" onClick={() => handleSend(c.cmd)} title={c.desc}>
            {c.cmd}
          </button>
        ))}
      </div>

      {/* 입력창 */}
      <div className="ai-composer">
        <input
          placeholder="질문하거나 '태스크 만들어줘', '티켓 업데이트해줘' 등으로 요청하세요…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading}
        />
        <button className="btn accent" onClick={() => handleSend()} disabled={!input.trim() || loading}>
          전송
        </button>
      </div>
    </div>
  );
}
