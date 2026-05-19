import { useState, useRef, useEffect } from 'react';
import { claudeComplete } from '../../lib/claude';
import { useMessages } from '../../hooks/useMessages';
import { useTasks } from '../../hooks/useTasks';
import useAppStore from '../../store/appStore';

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

const COMMANDS = [
  { cmd: '/오늘요약', desc: '오늘 메시지 + 결정 요약' },
  { cmd: '/스케줄', desc: '이번 주 마감 태스크' },
  { cmd: '/날씨', desc: '오늘 날씨' },
];

const SYSTEM_PROMPT = `당신은 Relay라는 팀 협업 툴의 AI 어시스턴트입니다.
팀 업무 관리와 의사결정을 도와주는 역할을 합니다.
항상 한국어로 간결하고 명확하게 답변하세요.
불필요한 설명은 생략하고 핵심만 전달하세요.`;

export default function AIChannel() {
  const { activeProject } = useAppStore();
  const { messages } = useMessages(activeProject);
  const { tasks } = useTasks(activeProject);
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'ai',
      text: '안녕하세요! Relay AI입니다.\n슬래시 명령어로 업무 현황을 확인하거나 자유롭게 질문하세요.',
      ts: nowHM(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  const buildContext = () => {
    const msgSummary = messages.slice(-20).map((m) => `[${m.ts}] ${m.senderName}: ${m.text || m.title || ''}`).join('\n');
    const taskSummary = tasks.filter((t) => !t.done).map((t) => `- ${t.title}${t.due ? ' (' + t.due + ')' : ''}`).join('\n');
    return { msgSummary, taskSummary };
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', text, ts: nowHM() };
    setChatHistory((h) => [...h, userMsg]);
    setLoading(true);

    try {
      const { msgSummary, taskSummary } = buildContext();
      let prompt = text;

      if (text === '/오늘요약') {
        prompt = `오늘 팀 채팅 메시지 요약을 해주세요. 결정 대기, 승인 대기, 진행 현황, 주의사항을 각각 분리해서 간결하게 작성하세요.\n\n채팅 내역:\n${msgSummary}`;
      } else if (text === '/스케줄') {
        prompt = `다음 미완료 태스크에서 오늘/내일/이번주 마감 항목을 우선순위 순으로 정리해주세요:\n${taskSummary || '(태스크 없음)'}`;
      } else if (text === '/날씨') {
        prompt = '오늘 서울 날씨를 간단히 알려주세요. (날씨 API 미연동 — 일반적인 5월 날씨 정보 제공)';
      } else if (text.includes('요약')) {
        prompt = `${text}\n\n채팅 내역:\n${msgSummary}\n\n태스크:\n${taskSummary}`;
      }

      const result = await claudeComplete(prompt, SYSTEM_PROMPT);
      setChatHistory((h) => [...h, { role: 'ai', text: result, ts: nowHM() }]);
    } catch (err) {
      setChatHistory((h) => [...h, { role: 'ai', text: 'AI 연결에 실패했습니다. API 설정을 확인해주세요.', ts: nowHM(), error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="col-mid ai-channel-view">
      <div className="chat-head" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }}>
        <span className="ai-dot" />
        <span style={{ fontWeight: 700, color: 'var(--accent)', marginLeft: 8 }}>Relay AI</span>
        <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.7, marginLeft: 8, fontFamily: 'var(--font-mono)' }}>Claude Haiku · online</span>
      </div>

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
            <div className={'ai-msg-bubble' + (msg.error ? ' error' : '')} style={msg.error ? { background: 'var(--rose-bg)', color: 'var(--rose)', border: '1px solid var(--rose-line)' } : {}}>
              <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {msg.text}
              </pre>
            </div>
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
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>답변 생성 중…</span>
            </div>
          </div>
        )}
      </div>

      <div className="ai-commands">
        {COMMANDS.map((c) => (
          <button key={c.cmd} className="ai-cmd-chip" onClick={() => { setInput(c.cmd); }}>
            {c.cmd}
          </button>
        ))}
      </div>

      <div className="ai-composer">
        <input
          placeholder="메시지를 입력하거나 /오늘요약 같은 명령어를 사용하세요…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button className="btn accent" onClick={handleSend} disabled={!input.trim() || loading}>전송</button>
      </div>
    </div>
  );
}
