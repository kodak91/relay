import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown as MarkdownExtension } from 'tiptap-markdown';
import { claudeComplete, AI_ACTIONS } from '../../lib/claude';

const SLASH_MAP = {
  '/컨펌': 'approval',
  '/결정': 'decision',
  '/투표': 'vote',
  '/보고': 'update',
  '/공지': 'announce',
  '/회의': 'meeting',
  '/할당': 'assign',
  '/티켓': 'ticket',
};

const MESSAGE_TYPES = [
  { id: 'text',     label: '일반',   icon: '💬', slash: '' },
  { id: 'approval', label: '/컨펌',  icon: '✓',  slash: '/컨펌' },
  { id: 'decision', label: '/결정',  icon: '◇',  slash: '/결정' },
  { id: 'vote',     label: '/투표',  icon: '◉',  slash: '/투표' },
  { id: 'update',   label: '/보고',  icon: '◆',  slash: '/보고' },
  { id: 'announce', label: '/공지',  icon: '📢', slash: '/공지' },
  { id: 'casual',   label: '$잡담',  icon: '☕', slash: '' },
  { id: 'meeting',  label: '/회의',  icon: '📋', slash: '/회의' },
  { id: 'assign',   label: '/할당',  icon: '📌', slash: '/할당' },
  { id: 'ticket',   label: '/티켓',  icon: '🎫', slash: '/티켓' },
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

function AssignBuilder({ members, assignee, setAssignee, taskText, setTaskText }) {
  const others = members.filter((m) => m.uid);
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>📌</span> 태스크 할당
      </div>
      <select
        value={assignee?.uid || ''}
        onChange={(e) => setAssignee(others.find((m) => m.uid === e.target.value) || null)}
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '6px 8px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', marginBottom: 8, fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}
      >
        <option value="">팀원 선택…</option>
        {others.map((m) => (
          <option key={m.uid} value={m.uid}>{m.name || m.uid}</option>
        ))}
      </select>
      <input
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '7px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)' }}
        placeholder="할당할 업무 내용…"
        value={taskText}
        onChange={(e) => setTaskText(e.target.value)}
      />
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

function TicketBuilder({ members, title, setTitle, desc, setDesc, assigneeUid, setAssigneeUid, due, setDue, priority, setPriority }) {
  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', color: 'var(--ink)' };
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>🎫</span> 티켓 생성
      </div>
      <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="티켓 제목 *" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <textarea style={{ ...inputStyle, marginBottom: 8, resize: 'none' }} placeholder="설명 (선택)" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
      <div style={{ display: 'flex', gap: 8 }}>
        <select style={{ ...inputStyle, flex: 1 }} value={priority} onChange={(e) => setPriority(e.target.value)}>
          {['낮음', '보통', '높음', '긴급'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select style={{ ...inputStyle, flex: 1 }} value={assigneeUid} onChange={(e) => setAssigneeUid(e.target.value)}>
          <option value="">담당자 없음</option>
          {(members || []).filter((m) => m.uid).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
        </select>
        <input type="date" style={{ ...inputStyle, flex: 1 }} value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
    </div>
  );
}

function formatBytes(b) {
  if (b < 1024) return b + 'B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + 'KB';
  return (b / (1024 * 1024)).toFixed(1) + 'MB';
}

function FilePreviewZone({ files, onRemove }) {
  return (
    <div className="composer-files">
      {files.map((f, i) => (
        <div
          key={i}
          className="composer-file-card"
          style={{
            zIndex: files.length - i,
            transform: `translate(${i * 10}px, ${i * 4}px) rotate(${(i % 2 === 0 ? 1 : -1) * i * 0.5}deg)`,
          }}
        >
          {f.preview ? (
            <img src={f.preview} alt={f.name} className="composer-file-thumb" />
          ) : (
            <div className="composer-file-icon">{f.name.split('.').pop().toUpperCase()}</div>
          )}
          <div className="composer-file-name">{f.name.length > 16 ? f.name.slice(0, 14) + '…' : f.name}</div>
          <div className="composer-file-size">{formatBytes(f.size)}</div>
          <button className="composer-file-rm" onClick={() => onRemove(i)} title="제거">×</button>
        </div>
      ))}
    </div>
  );
}

function KBSuggestions({ text, folders, selectedId, onSelect, showAll, onToggleAll }) {
  const keywords = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const scored = folders.map((f) => {
    const name = f.name.toLowerCase();
    const score = keywords.filter((k) => name.includes(k)).length;
    return { ...f, score };
  });
  const topFolders = showAll
    ? folders
    : scored.sort((a, b) => b.score - a.score).slice(0, 4);

  return (
    <div className="composer-kb-row">
      <span className="composer-kb-label">📚 저장 위치</span>
      {topFolders.map((f) => (
        <button
          key={f.id}
          className={'composer-kb-chip' + (selectedId === f.id ? ' on' : '')}
          onClick={() => onSelect(selectedId === f.id ? null : f.id)}
          title={f.drivePath || f.name}
        >
          {f.isRoot ? '🗂' : '📁'} {f.name}
        </button>
      ))}
      <button className="composer-kb-chip more" onClick={onToggleAll}>
        {showAll ? '접기' : '다른 이름으로 저장…'}
      </button>
    </div>
  );
}

export default function Composer({ onSend, onFileUpload, members = [], kbFolders = [] }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('text');
  const [importance, setImportance] = useState(0);
  const [polishing, setPolishing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [selectedKBFolderId, setSelectedKBFolderId] = useState(null);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const internalFileRef = useRef(null);
  const actionsRef = useRef(null);

  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionOptions, setDecisionOptions] = useState(['', '']);
  const [voteTitle, setVoteTitle] = useState('');
  const [voteOptions, setVoteOptions] = useState(['', '']);
  const [assignee, setAssignee] = useState(null);
  const [assignTaskText, setAssignTaskText] = useState('');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketAssigneeUid, setTicketAssigneeUid] = useState('');
  const [ticketDue, setTicketDue] = useState('');
  const [ticketPriority, setTicketPriority] = useState('보통');

  const addFiles = (fileList) => {
    const items = Array.from(fileList).map((file) => ({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setPendingFiles((prev) => [...prev, ...items]);
  };

  const removeFile = (idx) => {
    setPendingFiles((prev) => {
      const next = [...prev];
      if (next[idx]?.preview) URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
  };

  // Refs to avoid stale closures in editor callbacks
  const onEnterRef = useRef(null);
  const onUpdateRef = useRef(null);
  const placeholderRef = useRef('');

  const isCasual = type === 'casual';
  const isDecision = type === 'decision';
  const isVote = type === 'vote';
  const isApproval = type === 'approval';
  const isTicket = type === 'ticket';
  const startsDoubleSlash = text.startsWith('//');
  const showAccentSend = type !== 'text' && type !== 'casual';

  placeholderRef.current = isCasual
    ? '팀에게 가볍게 한마디… (1시간 뒤 사라짐)'
    : '메시지 입력…  // : 매너모드   $ : 잡담   /! /!! : 중요도   #태그';

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
          addFiles(event.dataTransfer.files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onUpdateRef.current?.(editor);
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(!polishing);
  }, [editor, polishing]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showTypeMenu) return;
    const handler = (e) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setShowTypeMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTypeMenu]);

  const checkSlashCommand = (md) => {
    // 66: only fire after user presses space (prevents /! from blocking /!!)
    if (!md.endsWith(' ')) return false;

    const trimmed = md.trim();

    // Importance shortcuts: /! = 중요(★), /!! = 매우 중요(★★)
    if (trimmed === '/!!') {
      setImportance(2);
      editor?.commands.clearContent();
      setText('');
      return true;
    }
    if (trimmed === '/!') {
      setImportance(1);
      editor?.commands.clearContent();
      setText('');
      return true;
    }

    // $ prefix → casual (잡담) mode; keep content in editor
    if (trimmed.startsWith('$') && type !== 'casual') {
      setType('casual');
      return false;
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

  const isAssign = type === 'assign';

  const handleSend = () => {
    // 62: dispatch staged files first
    if (pendingFiles.length > 0) {
      onFileUpload?.(pendingFiles.map((f) => f.file), selectedKBFolderId);
      pendingFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
      setPendingFiles([]);
      setSelectedKBFolderId(null);
      setShowSaveAs(false);
    }
    if (isTicket) {
      if (!ticketTitle.trim()) return;
      const assigneeMember = members.find((m) => m.uid === ticketAssigneeUid);
      onSend({
        type: 'ticket',
        text: ticketTitle.trim(),
        ticketTitle: ticketTitle.trim(),
        ticketDesc: ticketDesc.trim(),
        assigneeUid: ticketAssigneeUid || null,
        assigneeName: assigneeMember?.name || null,
        dueDate: ticketDue || null,
        ticketPriority,
        tags: [],
      });
      setTicketTitle(''); setTicketDesc(''); setTicketAssigneeUid(''); setTicketDue(''); setTicketPriority('보통');
      setType('text');
      return;
    }
    if (isAssign) {
      if (!assignee || !assignTaskText.trim()) return;
      onSend({
        type: 'assign',
        text: assignTaskText.trim(),
        assigneeUid: assignee.uid,
        assigneeName: assignee.name,
        tags: [],
      });
      setAssignee(null);
      setAssignTaskText('');
      setType('text');
      return;
    }

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
    const cleanText = type === 'casual' && text.trimStart().startsWith('$')
      ? text.trimStart().slice(1).trim()
      : text.trim();
    const msg = { type, text: cleanText, tags, importance };
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
    // 61: preserve typed text when switching types
    if (t !== 'decision') { setDecisionTitle(''); setDecisionOptions(['', '']); }
    if (t !== 'vote') { setVoteTitle(''); setVoteOptions(['', '']); }
    if (t !== 'assign') { setAssignee(null); setAssignTaskText(''); }
    if (t !== 'ticket') { setTicketTitle(''); setTicketDesc(''); setTicketAssigneeUid(''); setTicketDue(''); setTicketPriority('보통'); }
  };

  // Update refs every render so editor callbacks always see fresh state
  onEnterRef.current = () => {
    if (startsDoubleSlash) runPolish();
    else handleSend();
  };
  onUpdateRef.current = (ed) => {
    const md = ed.storage.markdown.getMarkdown();
    setText(md);
    checkSlashCommand(md);
  };

  const tags = text.match(/#\S+/g) || [];
  const canSend = pendingFiles.length > 0 || (isTicket
    ? ticketTitle.trim()
    : isAssign
    ? (assignee && assignTaskText.trim())
    : isDecision
    ? (decisionTitle.trim() && decisionOptions.filter((o) => o.trim()).length >= 2)
    : isVote
    ? (voteTitle.trim() && voteOptions.filter((o) => o.trim()).length >= 2)
    : text.trim());

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

        {isAssign && (
          <AssignBuilder
            members={members}
            assignee={assignee}
            setAssignee={setAssignee}
            taskText={assignTaskText}
            setTaskText={setAssignTaskText}
          />
        )}

        {isTicket && (
          <TicketBuilder
            members={members}
            title={ticketTitle} setTitle={setTicketTitle}
            desc={ticketDesc} setDesc={setTicketDesc}
            assigneeUid={ticketAssigneeUid} setAssigneeUid={setTicketAssigneeUid}
            due={ticketDue} setDue={setTicketDue}
            priority={ticketPriority} setPriority={setTicketPriority}
          />
        )}

        {isCasual && !isDecision && !isVote && (
          <div className="casual-banner">
            <span className="dot" /> 잡담 모드 · 이 메시지는 <b>1시간 뒤 자동 삭제</b>됩니다
          </div>
        )}
        {isApproval && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber-line)', fontSize: 11, fontWeight: 700, color: 'oklch(0.42 0.13 70)' }}>
            ✓ 컨펌 요청 <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>— 전송하면 컨펌 대기로 이동합니다</span>
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

        {!isDecision && !isVote && !isAssign && !isTicket && (
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

        {/* 62: file preview zone */}
        {pendingFiles.length > 0 && (
          <FilePreviewZone files={pendingFiles} onRemove={removeFile} />
        )}

        {/* 62: KB save suggestions when files pending */}
        {pendingFiles.length > 0 && kbFolders.length > 0 && (
          <KBSuggestions
            text={text}
            folders={kbFolders}
            selectedId={selectedKBFolderId}
            onSelect={(id) => { setSelectedKBFolderId(id); setShowSaveAs(false); }}
            showAll={showSaveAs}
            onToggleAll={() => setShowSaveAs((v) => !v)}
          />
        )}

        <div className="actions" ref={actionsRef}>
          {/* + 파일 버튼 */}
          <div className="composer-btn-wrap">
            <button
              className={'composer-act-btn' + (pendingFiles.length > 0 ? ' has-type' : '')}
              onClick={() => internalFileRef.current?.click()}
              title="파일 첨부"
            >
              {pendingFiles.length > 0 ? `+${pendingFiles.length}` : '+'}
            </button>
          </div>
          <input
            ref={internalFileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {/* / 메시지 유형 버튼 */}
          <div className="composer-btn-wrap">
            <button
              className={'composer-act-btn' + (showTypeMenu ? ' on' : '') + (type !== 'text' ? ' has-type' : '')}
              onClick={() => setShowTypeMenu((v) => !v)}
              title="메시지 유형"
            >
              {type !== 'text'
                ? <><span style={{ opacity: 0.5 }}>/</span>{MESSAGE_TYPES.find((t) => t.id === type)?.label}</>
                : '/'}
            </button>
            {showTypeMenu && (
              <div className="composer-dropdown type-drop">
                {MESSAGE_TYPES.map((tt) => (
                  <button
                    key={tt.id}
                    className={tt.id === type ? 'active' : ''}
                    onClick={() => { setTypeAndReset(tt.id); setShowTypeMenu(false); }}
                  >
                    <span className="ico">{tt.icon}</span> {tt.label}
                  </button>
                ))}
                <div className="composer-dropdown-sep" />
                <button
                  style={{ color: importance ? 'var(--rose)' : undefined }}
                  onClick={() => { setImportance((importance + 1) % 3); setShowTypeMenu(false); }}
                >
                  <span className="ico">{importance === 0 ? '☆' : '⭐'.repeat(importance)}</span> 중요도
                </button>
              </div>
            )}
          </div>

          <span style={{ flex: 1 }} />
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
