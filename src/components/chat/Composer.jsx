import { useState, useRef, useEffect, useMemo } from 'react';
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

function DecisionBuilder({ title, setTitle, options, setOptions, members, target, setTarget, onCtrlEnter }) {
  const addOption = () => setOptions([...options, '']);
  const removeOption = (i) => { if (options.length <= 2) return; setOptions(options.filter((_, idx) => idx !== i)); };
  const updateOption = (i, v) => setOptions(options.map((o, idx) => idx === i ? v : o));
  const inputStyle = { border: '1px solid var(--border)', borderRadius: 'var(--r-2)', background: 'var(--surface-2)', outline: 'none', fontFamily: 'var(--font-sans)', color: 'var(--ink)' };

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>◇</span> 결정 요청
        <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          결정권자
          <select
            value={target?.uid || ''}
            onChange={(e) => setTarget(members.find((m) => m.uid === e.target.value) || null)}
            style={{ ...inputStyle, padding: '2px 6px', fontSize: 12 }}
          >
            <option value="">선택…</option>
            {members.filter((m) => m.uid).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </select>
        </span>
      </div>
      <input
        style={{ ...inputStyle, width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 8 }}
        placeholder="결정 안건 제목을 입력하세요…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onCtrlEnter}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {String.fromCharCode(65 + i)}
            </span>
            <input
              style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 13 }}
              placeholder={`옵션 ${String.fromCharCode(65 + i)}`}
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              onKeyDown={onCtrlEnter}
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

function AssignBuilder({ members, assignee, setAssignee, taskText, setTaskText, onCtrlEnter }) {
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
        onKeyDown={onCtrlEnter}
      />
    </div>
  );
}

function VoteBuilder({ title, setTitle, options, setOptions, onCtrlEnter }) {
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
        onKeyDown={onCtrlEnter}
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
              onKeyDown={onCtrlEnter}
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

function TicketBuilder({ members, title, setTitle, desc, setDesc, assigneeUid, setAssigneeUid, due, setDue, priority, setPriority, recentMessages }) {
  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', color: 'var(--ink)' };
  const [aiLoading, setAiLoading] = useState(false);

  const fillWithAI = async () => {
    if (aiLoading) return;
    const ctx = (recentMessages || [])
      .filter((m) => m.text)
      .map((m) => `${m.senderName || '?'}: ${m.text}`)
      .join('\n');
    if (!ctx.trim()) return;
    setAiLoading(true);
    try {
      const raw = await claudeComplete(
        `다음 팀 채팅 내용을 바탕으로 티켓 초안을 JSON으로 만들어주세요.\n대화:\n${ctx}\n\n{"title":"작업 제목(한국어,50자이내)","priority":"높음|보통|낮음|긴급","description":"간단한 설명(한국어,80자이내)"}\nJSON만 출력:`
      );
      const json = JSON.parse(raw.replace(/```json?|```/g, '').trim());
      if (json.title) setTitle(json.title);
      if (json.description) setDesc(json.description);
      if (json.priority && ['긴급','높음','보통','낮음'].includes(json.priority)) setPriority(json.priority);
    } catch { /* ignore parse errors */ }
    finally { setAiLoading(false); }
  };

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>🎫</span> 티켓 생성
        {(recentMessages || []).length > 0 && (
          <button
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--accent-line)', borderRadius: 'var(--r-2)', padding: '2px 8px', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', cursor: 'pointer', fontWeight: 600 }}
            onClick={fillWithAI}
            disabled={aiLoading}
            title="최근 대화 맥락으로 AI가 초안 생성"
          >
            {aiLoading ? '⋯' : '✦'} AI 초안
          </button>
        )}
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

const RECENT_KB_KEY = 'relay_recent_kb';
function getRecentIds() {
  try { return JSON.parse(localStorage.getItem(RECENT_KB_KEY) || '[]'); } catch { return []; }
}
function pushRecentId(id) {
  const next = [id, ...getRecentIds().filter((v) => v !== id)].slice(0, 5);
  try { localStorage.setItem(RECENT_KB_KEY, JSON.stringify(next)); } catch {}
}

function KBSuggestions({ pendingFiles = [], text, folders, selectedId, onSelect }) {
  const recentIds = getRecentIds();
  // Score folders by file name keywords + typed text keywords
  const keywords = [
    ...text.toLowerCase().split(/\s+/).filter((w) => w.length > 1),
    ...pendingFiles.map((f) =>
      f.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[-_.]/g, ' ').split(/\s+/)
    ).flat().filter((w) => w.length > 1),
  ];
  const scored = folders.map((f) => {
    const name = f.name.toLowerCase();
    const score = keywords.filter((k) => name.includes(k)).length;
    const recentRank = recentIds.indexOf(f.id);
    return { ...f, score, recentRank };
  });
  const recents = scored.filter((f) => f.recentRank >= 0).sort((a, b) => a.recentRank - b.recentRank).slice(0, 2);
  const suggestions = scored.filter((f) => f.recentRank < 0 && f.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  const fallback = keywords.length === 0 && recents.length === 0 ? scored.slice(0, 3) : [];
  const shown = [...new Map([...recents, ...suggestions, ...fallback].map((f) => [f.id, f])).values()];

  return (
    <div className="composer-kb-row">
      <span className="composer-kb-label">💾 저장</span>
      {shown.map((f) => (
        <button
          key={f.id}
          className={'composer-kb-chip' + (selectedId === f.id ? ' on' : '')}
          onClick={() => {
            const next = selectedId === f.id ? null : f.id;
            if (next) pushRecentId(next);
            onSelect(next);
          }}
          title={f.drivePath || f.name}
        >
          {f.recentRank >= 0 ? '⏱' : (f.isRoot ? '🗂' : '📁')} {f.name}
          {f.driveFolderId && <span className="composer-kb-drive-badge">G</span>}
        </button>
      ))}
      <button
        className={'composer-kb-chip more' + (selectedId === '__manual__' ? ' on' : '')}
        onClick={() => onSelect(selectedId === '__manual__' ? null : '__manual__')}
      >
        {selectedId === '__manual__' ? '✓ 수동 저장' : '수동 저장…'}
      </button>
    </div>
  );
}

function extractLeadingTags(text) {
  const match = text.trimStart().match(/^(#\S+(?:\s+|$))+/);
  return match ? (match[0].match(/#\S+/g) || []) : [];
}

// Tiptap 마크다운 직렬화 정리 — 하드브레이크 정상화 + 직렬화가 넣는 백슬래시 이스케이프 제거.
// (\#, \*, 1\. 등이 저장/표시/슬랙에 그대로 남는 문제 방지)
function cleanMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/\\\n/g, '  \n')                          // 하드브레이크 → CommonMark 하드브레이크
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')      // 직렬화 이스케이프 제거
    .trim();
}

export default function Composer({ onSend, onFileUpload, onOpenMeeting, onPMAI, members = [], kbFolders = [], recentMessages = [], activeTag = 'all' }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('text');
  const [importance, setImportance] = useState(0);
  const [polishing, setPolishing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [selectedKBFolderId, setSelectedKBFolderId] = useState(null);
  const internalFileRef = useRef(null);
  const actionsRef = useRef(null);

  // @멘션 — 입력 시 멤버 목록 팝업, 선택 시 멤버에게 알림
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef({ open: false, items: [], index: 0 });
  const selectMentionRef = useRef(null);
  const closeMentionRef = useRef(null);

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

  const [approvalTarget, setApprovalTarget] = useState(null);
  const [decisionTarget, setDecisionTarget] = useState(null);

  // 팀장을 기본 대상으로 설정
  const leadMember = useMemo(() => members.find((m) => m.role === 'lead') || members[0] || null, [members]);
  useEffect(() => {
    if (leadMember) {
      setApprovalTarget((prev) => prev || leadMember);
      setDecisionTarget((prev) => prev || leadMember);
    }
  }, [leadMember]);

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
  const addFilesRef = useRef(null);
  const placeholderRef = useRef('');
  addFilesRef.current = addFiles;

  const isCasual = type === 'casual';
  const isDecision = type === 'decision';
  const isVote = type === 'vote';
  const isApproval = type === 'approval';
  const isTicket = type === 'ticket';
  const startsDoubleSlash = text.startsWith('//');
  // PM AI mode: starts with "/ " (slash + space) — distinct from slash-commands which have no space
  const isPMAI = /^\/ .+/.test(text) && type === 'text';
  const showAccentSend = type !== 'text' && type !== 'casual';

  placeholderRef.current = isCasual
    ? '팀에게 가볍게 한마디… (1시간 뒤 사라짐)'
    : '메시지 입력…  // : 매너모드   $ : 잡담   /! /!! : 중요도   #태그';

  const editor = useEditor({
    extensions: [
      StarterKit,
      MarkdownExtension.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'tiptap-ta' },
      handleKeyDown: (_view, event) => {
        // @멘션 팝업이 열려 있으면 방향키/Enter/Tab/Esc 를 팝업 조작에 사용
        const ms = mentionRef.current;
        if (ms.open && ms.items.length > 0) {
          if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex((i) => (i + 1) % ms.items.length); return true; }
          if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex((i) => (i - 1 + ms.items.length) % ms.items.length); return true; }
          if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectMentionRef.current?.(ms.items[ms.index]); return true; }
          if (event.key === 'Escape') { event.preventDefault(); closeMentionRef.current?.(); return true; }
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          // Ctrl/Cmd+Enter always sends (even inside a list)
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onEnterRef.current?.();
            return true;
          }
          // Let Tiptap handle Enter inside list items (continue list / exit on empty)
          const { $from } = _view.state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === 'listItem') return false;
          }
          event.preventDefault();
          onEnterRef.current?.();
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files?.length) {
          event.preventDefault();
          // stopPropagation 으로 ChatMain 의 onDrop(즉시 업로드)까지 같이 실행돼
          // 파일이 두 번 첨부되는 문제 방지 — 컴포저에 드롭하면 대기열에만 추가
          event.stopPropagation();
          addFilesRef.current?.(event.dataTransfer.files);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const imageFiles = Array.from(event.clipboardData?.items || [])
          .filter((i) => i.type.startsWith('image/'))
          .map((i) => i.getAsFile())
          .filter(Boolean);
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        addFilesRef.current?.(imageFiles);
        return true;
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

  const isMeeting = type === 'meeting';

  // Ctrl+Enter (또는 Cmd+Enter) 전송 — 빌더 입력창에서 사용
  const ctrlEnter = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    // PM AI mode: "/ " prefix — send query to PM AI instead of chat
    if (isPMAI) {
      const query = text.replace(/^\/ /, '').trim();
      if (query) {
        onPMAI?.(query);
        editor?.commands.clearContent();
        setText('');
      }
      return;
    }

    // Meeting: open meeting modal instead of sending a plain message
    if (isMeeting) {
      onOpenMeeting?.(text.trim());
      editor?.commands.clearContent();
      setText('');
      setType('text');
      return;
    }

    // Files: upload + send combined with caption text + tags
    if (pendingFiles.length > 0) {
      const caption = cleanMarkdown(text);
      // 캡션 선두 태그 + 현재 태그 탭(activeTag)을 첨부 메시지에도 부여
      const fileTags = extractLeadingTags(caption);
      if (activeTag && activeTag !== 'all' && !fileTags.includes(activeTag)) fileTags.push(activeTag);
      onFileUpload?.(pendingFiles.map((f) => f.file), selectedKBFolderId, caption, fileTags);
      pendingFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
      setPendingFiles([]);
      setSelectedKBFolderId(null);
      editor?.commands.clearContent();
      setText('');
      return;
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
        targetUid: decisionTarget?.uid || null,
        targetName: decisionTarget?.name || null,
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
    const rawForClean = type === 'casual' && text.trimStart().startsWith('$')
      ? text.trimStart().slice(1)
      : text;
    // 하드브레이크 정상화 + tiptap 직렬화 이스케이프(\#, \*, 1\. 등) 제거
    const cleanText = cleanMarkdown(rawForClean);
    const tags = extractLeadingTags(cleanText);
    if (activeTag && activeTag !== 'all' && !tags.includes(activeTag)) tags.push(activeTag);
    const msg = { type, text: cleanText, tags, importance };
    // @멘션 대상 추출 → 해당 멤버에게 알림 (본인 제외는 수신측에서 처리)
    const mentionUids = members
      .filter((m) => m.uid && m.name && cleanText.includes(`@${m.name}`))
      .map((m) => m.uid);
    if (mentionUids.length) msg.mentions = [...new Set(mentionUids)];
    if (type === 'casual') msg.expiresAt = Date.now() + 60 * 60 * 1000;
    if (type === 'approval') {
      msg.status = 'pending';
      msg.targetUid = approvalTarget?.uid || null;
      msg.targetName = approvalTarget?.name || null;
    }
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

  // @멘션 — 커서 앞의 "@질의" 를 감지해 멤버 후보 팝업 갱신
  const updateMentionState = (ed) => {
    const { from } = ed.state.selection;
    const before = ed.state.doc.textBetween(Math.max(0, from - 40), from, '\n', ' ');
    const m = before.match(/@([^\s@]*)$/);
    if (!m) { setMentionOpen(false); return; }
    const q = m[1].toLowerCase();
    const items = members
      .filter((mm) => mm.uid && (!q || (mm.name || '').toLowerCase().includes(q)))
      .slice(0, 8);
    setMentionItems(items);
    setMentionIndex(0);
    setMentionOpen(items.length > 0);
  };

  // 후보 선택 → 에디터의 "@질의" 를 "@이름 " 으로 치환
  const selectMention = (member) => {
    if (!editor || !member) return;
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 40), from, '\n', ' ');
    const m = before.match(/@([^\s@]*)$/);
    if (!m) { setMentionOpen(false); return; }
    const start = from - m[0].length;
    editor.chain().focus().insertContentAt({ from: start, to: from }, `@${member.name} `).run();
    setMentionOpen(false);
  };

  mentionRef.current = { open: mentionOpen, items: mentionItems, index: mentionIndex };
  selectMentionRef.current = selectMention;
  closeMentionRef.current = () => setMentionOpen(false);

  // Update refs every render so editor callbacks always see fresh state
  onEnterRef.current = () => {
    if (isPMAI) handleSend();
    else if (startsDoubleSlash) runPolish();
    else handleSend();
  };
  onUpdateRef.current = (ed) => {
    const md = ed.storage.markdown.getMarkdown();
    setText(md);
    checkSlashCommand(md);
    updateMentionState(ed);
  };

  const tags = extractLeadingTags(text);
  const canSend = isMeeting || pendingFiles.length > 0 || (isTicket
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
      <div className={'box-outer' + (isCasual ? ' casual' : '') + (startsDoubleSlash ? ' polish-mode' : '')}>
        <div className="box-inner">

        {isDecision && (
          <DecisionBuilder
            title={decisionTitle} setTitle={setDecisionTitle}
            options={decisionOptions} setOptions={setDecisionOptions}
            members={members} target={decisionTarget} setTarget={setDecisionTarget}
            onCtrlEnter={ctrlEnter}
          />
        )}

        {isVote && (
          <VoteBuilder
            title={voteTitle} setTitle={setVoteTitle}
            options={voteOptions} setOptions={setVoteOptions}
            onCtrlEnter={ctrlEnter}
          />
        )}

        {isAssign && (
          <AssignBuilder
            members={members}
            assignee={assignee}
            setAssignee={setAssignee}
            taskText={assignTaskText}
            setTaskText={setAssignTaskText}
            onCtrlEnter={ctrlEnter}
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
            recentMessages={recentMessages}
          />
        )}

        {isCasual && !isDecision && !isVote && (
          <div className="casual-banner">
            <span className="dot" /> 잡담 모드 · 이 메시지는 <b>1시간 뒤 자동 삭제</b>됩니다
          </div>
        )}
        {isApproval && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber-line)', fontSize: 11, fontWeight: 700, color: 'oklch(0.42 0.13 70)' }}>
            ✓ 컨펌 요청
            <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
              결재자
              <select
                value={approvalTarget?.uid || ''}
                onChange={(e) => setApprovalTarget(members.find((m) => m.uid === e.target.value) || null)}
                style={{ border: '1px solid var(--amber-line)', borderRadius: 'var(--r-2)', background: 'var(--amber-bg)', padding: '2px 6px', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', color: 'oklch(0.42 0.13 70)' }}
              >
                <option value="">선택…</option>
                {members.filter((m) => m.uid).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
              </select>
            </span>
          </div>
        )}
        {isMeeting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--accent-soft)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
            📋 회의 모드 <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>— 회의 제목을 입력하고 보내기를 누르면 회의가 시작됩니다</span>
          </div>
        )}
        {isPMAI && !polishing && (
          <div className="polish-banner" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)', color: 'var(--accent)' }}>
            <span className="ai-dot-sm" /> PM AI 모드 · <b>Enter</b>로 전송
          </div>
        )}
        {startsDoubleSlash && !polishing && !isDecision && !isVote && !isPMAI && (
          <div className="polish-banner">
            <span className="ai-dot-sm" /> 매너모드 · <b>Enter</b>로 정중하게 변환
          </div>
        )}
        {polishing && (
          <div className="polish-banner">
            <span className="ai-typing"><span /><span /><span /></span> AI가 메시지를 다듬고 있어요…
          </div>
        )}
        {activeTag && activeTag !== 'all' && (
          <div className="tags-mini" style={{ borderBottom: '1px solid var(--border)', background: 'var(--accent-soft)' }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>태그 자동 입력:</span>
            <span className="tag on" style={{ fontSize: 11 }}>{activeTag}</span>
          </div>
        )}
        {tags.length > 0 && !isDecision && !isVote && (
          <div className="tags-mini">{tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
        )}

        {!isDecision && !isVote && !isAssign && !isTicket && (
          <div className="ta-wrap">
            <EditorContent editor={editor} />
            {mentionOpen && (
              <div className="mention-pop">
                <div className="mention-pop-hd">멤버 멘션 — 클릭 또는 Enter</div>
                {mentionItems.map((m, i) => (
                  <button
                    key={m.uid}
                    className={'mention-item' + (i === mentionIndex ? ' on' : '')}
                    onMouseEnter={() => setMentionIndex(i)}
                    onMouseDown={(e) => { e.preventDefault(); selectMention(m); }}
                  >
                    <span className="mention-ava">{(m.name || '?').slice(0, 1)}</span>
                    <span className="mention-nm">{m.name}</span>
                    {m.role === 'lead' && <span className="mention-role">팀장</span>}
                  </button>
                ))}
              </div>
            )}
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

        {/* KB/Drive save suggestions when files pending */}
        {pendingFiles.length > 0 && kbFolders.length > 0 && (
          <KBSuggestions
            pendingFiles={pendingFiles}
            text={text}
            folders={kbFolders}
            selectedId={selectedKBFolderId}
            onSelect={setSelectedKBFolderId}
          />
        )}

        </div>
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
