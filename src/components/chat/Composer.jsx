import { useState, useRef, useEffect } from 'react';
import { claudeComplete } from '../../lib/claude';
import { AI_ACTIONS } from '../../lib/claude';

const MESSAGE_TYPES = [
  { id: 'text',     label: '일반',      icon: '💬' },
  { id: 'approval', label: '승인 요청', icon: '✓'  },
  { id: 'decision', label: '결정 요청', icon: '◇'  },
  { id: 'vote',     label: '투표',      icon: '◉'  },
  { id: 'update',   label: '중간 보고', icon: '◆'  },
  { id: 'announce', label: '공지',      icon: '📢' },
  { id: 'casual',   label: '잡담',      icon: '☕' },
];

export default function Composer({ onSend }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('text');
  const [importance, setImportance] = useState(0);
  const [polishing, setPolishing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const aiBtnRef = useRef(null);

  const isCasual = type === 'casual';
  const startsSlash = text.startsWith('//');
  const showAccentSend = type !== 'text' && type !== 'casual';

  const handleKey = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (startsSlash) runPolish();
    else handleSend();
  };

  const handleSend = () => {
    if (!text.trim()) return;
    const tags = text.match(/#\S+/g) || [];
    const msg = { type, text: text.trim(), tags, importance };

    if (type === 'casual') {
      msg.expiresAt = Date.now() + 60 * 60 * 1000;
    }

    onSend(msg);
    setText('');
    setType('text');
    setImportance(0);
  };

  const runPolish = async () => {
    const raw = text.replace(/^\/\/\s*/, '').trim();
    if (!raw) return;
    setPolishing(true);
    try {
      const action = AI_ACTIONS.find((a) => a.id === 'polish');
      const result = await claudeComplete(action.getPrompt(raw));
      setText(result.replace(/^["「『]|["」』]$/g, '').trim());
    } catch {
      setText(raw);
    } finally {
      setPolishing(false);
    }
  };

  const runAction = async (action) => {
    setShowAI(false);
    if (action.id === 'casual') { setType('casual'); return; }
    if (!text.trim()) return;
    setPolishing(true);
    try {
      const result = await claudeComplete(action.getPrompt(text));
      setText(result.replace(/^["「『]|["」』]$/g, '').trim());
    } catch { /* ignore */ }
    finally { setPolishing(false); }
  };

  const tags = text.match(/#\S+/g) || [];

  return (
    <div className={'composer' + (isCasual ? ' casual-mode' : '')}>
      <div className={'box' + (isCasual ? ' casual' : '') + (startsSlash ? ' polish-mode' : '')}>
        {isCasual && (
          <div className="casual-banner">
            <span className="dot" /> 잡담 모드 · 이 메시지는 <b>1시간 뒤 자동 삭제</b>됩니다
          </div>
        )}
        {startsSlash && !polishing && (
          <div className="polish-banner">
            <span className="ai-dot-sm" /> AI 정중 톤 변환 모드 · <b>Enter</b>로 다듬기
          </div>
        )}
        {polishing && (
          <div className="polish-banner">
            <span className="ai-typing"><span /><span /><span /></span>
            AI가 메시지를 다듬고 있어요…
          </div>
        )}
        {tags.length > 0 && (
          <div className="tags-mini">{tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
        )}
        <div className="ta-wrap">
          <textarea
            className="ta"
            placeholder={
              isCasual ? '팀에게 가볍게 한마디… (1시간 뒤 사라짐)'
              : type === 'approval' ? '승인 요청 내용을 입력하세요…'
              : type === 'decision' ? '결정 요청 내용을 입력하세요…'
              : '메시지 보내기… (// 시작 후 Enter → AI 정중 톤 변환)'
            }
            rows={Math.min(6, Math.max(1, text.split('\n').length))}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            disabled={polishing}
          />
          <button
            ref={aiBtnRef}
            className={'ai-fab' + (showAI ? ' on' : '')}
            onClick={() => setShowAI((v) => !v)}
            title="AI 도구"
          >
            ✦
          </button>
          {showAI && (
            <div className="ai-fab-pop">
              <div className="ai-fab-hd">
                <span>AI 도구</span>
                <button className="ai-fab-x" onClick={() => setShowAI(false)}>✕</button>
              </div>
              {AI_ACTIONS.map((a) => (
                <button key={a.id} className="ai-fab-item" onClick={() => runAction(a)} disabled={a.id !== 'casual' && !text.trim()}>
                  <span className="ico">{a.icon}</span>
                  <div>
                    <div className="t">{a.title}</div>
                    <div className="d">{a.desc}</div>
                  </div>
                  {a.id === 'polish' && <kbd>//</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="actions">
          <div className="type-chips">
            {MESSAGE_TYPES.map((tt) => (
              <button key={tt.id} className="chip"
                style={tt.id === type ? { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' } : {}}
                onClick={() => setType(tt.id)}>
                <span className="glyph">{tt.icon}</span>
                <span>{tt.label}</span>
              </button>
            ))}
            <span className="chip" style={{ borderStyle: 'dashed', color: importance ? 'var(--rose)' : 'var(--ink-3)' }}
              onClick={() => setImportance((importance + 1) % 3)}>
              <span className="glyph">{importance === 0 ? '☆' : '⭐'.repeat(importance)}</span>
              <span>중요도</span>
            </span>
            <span className="chip" style={{ borderStyle: 'dashed' }}>
              <span className="glyph">📅</span>
              <span>마감일</span>
            </span>
          </div>
          <span className="kbd-hint" style={{ marginRight: 6 }}>
            <kbd>⇧</kbd><kbd>↵</kbd> 줄바꿈
          </span>
          <button
            className={'send' + (showAccentSend ? ' accent' : '') + (isCasual ? ' casual' : '')}
            onClick={handleSend}
            disabled={polishing || !text.trim()}
          >
            {isCasual ? '가볍게 보내기' : '보내기'} <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 2 }}>↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
