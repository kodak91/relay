import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown as MarkdownExtension } from 'tiptap-markdown';
import { claudeComplete, AI_ACTIONS } from '../../lib/claude';

const SLASH_MAP = {
  '/승인': 'approval',
  '/결정': 'decision',
  '/투표': 'vote',
  '/보고': 'update',
  '/공지': 'announce',
  '/잡담': 'casual',
  '/회의': 'meeting',
};

const MESSAGE_TYPES = [
  { id: 'text',     label: '일반',   icon: '💬', slash: '' },
  { id: 'approval', label: '/승인',  icon: '✓',  slash: '/승인' },
  { id: 'decision', label: '/결정',  icon: '◇',  slash: '/결정' },
  { id: 'vote',     label: '/투표',  icon: '◉',  slash: '/투표' },
  { id: 'update',   label: '/보고',  icon: '◆',  slash: '/보고' },
  { id: 'announce', label: '/공지',  icon: '📢', slash: '/공지' },
  { id: 'casual',   label: '/잡담',  icon: '☕', slash: '/잡담' },
  { id: 'meeting',  label: '/회의',  icon: '📋', slash: '/회의' },
];

function DecisionBuilder({ title, setTitle, options, setOptions }) {
  const addOption = () => setOptions([...options, '']);
  const removeOption = (i) => { if (options.length <= 2) return; setOptions(options.filter((_, idx) => idx !== i)); };
  const updateOption = (i, v) => setOptions(options.map((o, idx) => idx === i ? v : o));

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>◇</span> 결정 요청
      </div>
      <input
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '7px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', marginBottom: 8 }}
        placeholder="결정 안건 제목을 입력하세요…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {String.fromCharCode(65 + i)}
            </span>
            <input
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none' }}
              placeholder={`옵션 ${String.fromCharCode(65 + i)}`}
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button style={{ border: 0, background: 'transparent', color: 'var(--ink-mute)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }} onClick={() => removeOption(i)}>×</button>
            )}
          </div>
        ))}
      </div>
      <button
        style={{ marginTop: 8, border: '1px dashed var(--border)', borderRadius: 'var(--r-2)', padding: '5px 12px', fontSize: 12, color: 'var(--ink-3)', background: 'transparent', cursor: 'pointer', width: '100%' }}
        onClick={addOption}
      >+ 항목 추가</button>
    </div>
  );
}

function VoteBuilder({ title, setTitle, options, setOptions }) {
  const addOption = () => setOptions([...options, '']);
  const removeOption = (i) => { if (options.length <= 2) return; setOptions(options.filter((_, idx) => idx !== i)); };
  const updateOption = (i, v) => setOptions(options.map((o, idx) => idx === i ? v : o));

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>◉</span> 투표
      </div>
      <input
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '7px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', marginBottom: 8 }}
        placeholder="투표 제목을 입력하세요…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--ink-3)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--border)' }}>
              {i + 1}
            </span>
            <input
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none' }}
              placeholder={`선택지 ${i + 1}`}
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button style={{ border: 0, background: 'transparent', color: 'var(--ink-mute)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }} onClick={() => removeOption(i)}>×</button>
            )}
          </div>
        ))}
      </div>
      <button
        style={{ marginTop: 8, border: '1px dashed var(--border)', borderRadius: 'var(--r-2)', padding: '5px 12px', fontSize: 12, color: 'var(--ink-3)', background: 'transparent', cursor: 'pointer', width: '100%' }}
        onClick={addOption}
      >+ 선택지 추가</button>
    </div>
  );
}

export default function Composer({ onSend, onFileSelect, fileInputRef }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('text');
  const [importance, setImportance] = useState(0);
  const [polishing, setPolishing] = useState(false);
  const [showAI, setShowAI] = useState(false);

  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionOptions, setDecisionOptions] = useState(['', '']);
  const [voteTitle, setVoteTitle] = useState('');
  const [voteOptions, setVoteOptions] = useState(['', '']);

  // Refs to avoid stale closures in editor callbacks
  const onEnterRef = useRef(null);
  const onUpdateRef = useRef(null);
  const onFileSelectRef = useRef(null);
  const placeholderRef = useRef('');

  const isCasual = type === 'casual';
  const isDecision = type === 'decision';
  const isVote = type === 'vote';
  const isApproval = type === 'approval';
  const startsDoubleSlash = text.startsWith('//');
  const showAccentSend = type !== 'text' && type !== 'casual';

  placeholderRef.current = isCasual
    ? '팀에게 가볍게 한마디… (1시간 뒤 사라짐)'
    : '메시지 입력…  // : 매너모드   /버튼명 : 버튼 호출   /* /** : 중요도   #태그';

  const editor = useEditor({
    extensions: [
      StarterKit,
      MarkdownExtension.configure({ html: false }),
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'tiptap-ta' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onEnterRef.current?.();
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files?.length) {
          event.preventDefault();
          onFileSelectRef.current?.(event.dataTransfer.files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onUpdateRef.current?.(editor);
    },
  });

  // Keep editor editable state in sync with polishing
  useEffect(() => {
    if (editor) editor.setEditable(!polishing);
  }, [editor, polishing]);

  const checkSlashCommand = (md) => {
    const trimmed = md.trim();

    // Importance shortcuts: /* = 중요, /** = 매우 중요
    if (trimmed === '/**') {
      setImportance(2);
      editor?.commands.clearContent();
      setText('');
      return true;
    }
    if (trimmed === '/*') {
      setImportance(1);
      editor?.commands.clearContent();
      setText('');
      return true;
    }

    // Message type shortcuts
    const matched = SLASH_MAP[trimmed];
    if (matched) {
      setType(matched);
      editor?.commands.clearContent();
      setText('');
      return true;
    }
    return false;
  };

  const handleSend = () => {
    if (isDecision) {
      if (!decisionTitle.trim()) return;
      const validOpts = decisionOptions.filter((o) => o.trim());
      if (validOpts.length < 2) return;
      onSend({
        type: 'decision',
        title: decisionTitle.trim(),
        options: validOpts.map((o, i) => ({ id: String.fromCharCode(97 + i), letter: String.fromCharCode(65 + i), text: o.trim(), title: o.trim() })),
        chosen: null,
        tags: [],
      });
      setDecisionTitle('');
      setDecisionOptions(['', '']);
      setType('text');
      return;
    }

    if (isVote) {
      if (!voteTitle.trim()) return;
      const validOpts = voteOptions.filter((o) => o.trim());
      if (validOpts.length < 2) return;
      onSend({
        type: 'vote',
        title: voteTitle.trim(),
        options: validOpts.map((o, i) => ({ id: String.fromCharCode(97 + i), text: o.trim(), votes: [] })),
        tags: [],
      });
      setVoteTitle('');
      setVoteOptions(['', '']);
      setType('text');
      return;
    }

    if (!text.trim()) return;
    const tags = text.match(/#\S+/g) || [];
    const msg = { type, text: text.trim(), tags, importance };
    if (type === 'casual') msg.expiresAt = Date.now() + 60 * 60 * 1000;
    if (type === 'approval') msg.status = 'pending';
    onSend(msg);
    editor?.commands.clearContent();
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
      const cleaned = result.replace(/^["「『]|["」』]$/g, '').trim();
      editor?.commands.setContent(cleaned);
      setText(cleaned);
    } catch {
      editor?.commands.setContent(raw);
      setText(raw);
    }
    finally { setPolishing(false); }
  };

  const runAction = async (action) => {
    setShowAI(false);
    if (action.id === 'casual') { setType('casual'); return; }
    if (!text.trim()) return;
    setPolishing(true);
    try {
      const result = await claudeComplete(action.getPrompt(text));
      const cleaned = result.replace(/^["「『]|["」』]$/g, '').trim();
      editor?.commands.setContent(cleaned);
      setText(cleaned);
    } catch { }
    finally { setPolishing(false); }
  };

  const setTypeAndReset = (t) => {
    setType(t);
    editor?.commands.clearContent();
    setText('');
    if (t !== 'decision') { setDecisionTitle(''); setDecisionOptions(['', '']); }
    if (t !== 'vote') { setVoteTitle(''); setVoteOptions(['', '']); }
  };

  // Update refs every render so editor callbacks always see fresh state
  onEnterRef.current = () => {
    if (startsDoubleSlash) runPolish();
    else handleSend();
  };
  onFileSelectRef.current = onFileSelect;
  onUpdateRef.current = (ed) => {
    const md = ed.storage.markdown.getMarkdown();
    setText(md);
    checkSlashCommand(md);
  };

  const tags = text.match(/#\S+/g) || [];
  const canSend = isDecision
    ? (decisionTitle.trim() && decisionOptions.filter((o) => o.trim()).length >= 2)
    : isVote
    ? (voteTitle.trim() && voteOptions.filter((o) => o.trim()).length >= 2)
    : text.trim();

  return (
    <div className={'composer' + (isCasual ? ' casual-mode' : '')}>
      <div className={'box' + (isCasual ? ' casual' : '') + (startsDoubleSlash ? ' polish-mode' : '')}>

        {isDecision && (
          <DecisionBuilder
            title={decisionTitle} setTitle={setDecisionTitle}
            options={decisionOptions} setOptions={setDecisionOptions}
          />
        )}

        {isVote && (
          <VoteBuilder
            title={voteTitle} setTitle={setVoteTitle}
            options={voteOptions} setOptions={setVoteOptions}
          />
        )}

        {isCasual && !isDecision && !isVote && (
          <div className="casual-banner">
            <span className="dot" /> 잡담 모드 · 이 메시지는 <b>1시간 뒤 자동 삭제</b>됩니다
          </div>
        )}
        {isApproval && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber-line)', fontSize: 11, fontWeight: 700, color: 'oklch(0.42 0.13 70)' }}>
            ✓ 승인 요청 <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>— 전송하면 컨펌 대기로 이동합니다</span>
          </div>
        )}
        {startsDoubleSlash && !polishing && !isDecision && !isVote && (
          <div className="polish-banner">
            <span className="ai-dot-sm" /> 매너모드 · <b>Enter</b>로 정중하게 변환
          </div>
        )}
        {polishing && (
          <div className="polish-banner">
            <span className="ai-typing"><span /><span /><span /></span> AI가 메시지를 다듬고 있어요…
          </div>
        )}
        {tags.length > 0 && !isDecision && !isVote && (
          <div className="tags-mini">{tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
        )}

        {!isDecision && !isVote && (
          <div className="ta-wrap">
            <EditorContent editor={editor} />
            <button className={'ai-fab' + (showAI ? ' on' : '')} onClick={() => setShowAI((v) => !v)} title="AI 도구">✦</button>
            {showAI && (
              <div className="ai-fab-pop">
                <div className="ai-fab-hd">
                  <span>AI 도구</span>
                  <button className="ai-fab-x" onClick={() => setShowAI(false)}>✕</button>
                </div>
                {AI_ACTIONS.map((a) => (
                  <button key={a.id} className="ai-fab-item" onClick={() => runAction(a)} disabled={a.id !== 'casual' && !text.trim()}>
                    <span className="ico">{a.icon}</span>
                    <div><div className="t">{a.title}</div><div className="d">{a.desc}</div></div>
                    {a.id === 'polish' && <kbd>//</kbd>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="actions">
          <button
              className="chip"
              style={{ borderStyle: 'dashed' }}
              onClick={() => fileInputRef?.current?.click()}
              title="파일 첨부"
            >
              <span>📎</span>
              <span>파일</span>
            </button>
          <div className="type-chips">
            {MESSAGE_TYPES.map((tt) => (
              <button
                key={tt.id}
                className="chip"
                style={tt.id === type ? { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' } : {}}
                onClick={() => setTypeAndReset(tt.id)}
              >
                <span className="glyph">{tt.icon}</span>
                <span>{tt.label}</span>
              </button>
            ))}
            <span className="chip" style={{ borderStyle: 'dashed', color: importance ? 'var(--rose)' : 'var(--ink-3)' }} onClick={() => setImportance((importance + 1) % 3)}>
              <span className="glyph">{importance === 0 ? '☆' : '⭐'.repeat(importance)}</span>
              <span>중요도</span>
            </span>
          </div>
          <span className="kbd-hint" style={{ marginRight: 6 }}><kbd>⇧</kbd><kbd>↵</kbd> 줄바꿈</span>
          <button
            className={'send' + (showAccentSend ? ' accent' : '') + (isCasual ? ' casual' : '')}
            onClick={handleSend}
            disabled={polishing || !canSend}
          >
            {isCasual ? '가볍게 보내기' : '보내기'} <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 2 }}>↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
