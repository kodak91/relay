import { useRef, useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import useAppStore from '../../store/appStore';
import { useMessages } from '../../hooks/useMessages';
import { useProjects } from '../../hooks/useProjects';
import { useTasks } from '../../hooks/useTasks';
import Message from './Message';
import Composer from './Composer';
import TagBar from './TagBar';
import TasksTab from '../tasks/TasksTab';
import { uploadFile, IMAGE_TYPES, formatFileSize } from '../../lib/uploadFile';

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export default function ChatMain({ msgRefs, onJumpToMessage }) {
  const { activeProject, chatTab, setChatTab, activeTag, user } = useAppStore();
  const { messages, loading, sendMessage, addReply, updateMessageField, confirmMessage, nudgeMessage, deleteMessage, editMessage } = useMessages(activeProject);
  const { projects } = useProjects();
  const { addTask } = useTasks(activeProject);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const [openThreads, setOpenThreads] = useState(new Set());
  const [replyValues, setReplyValues] = useState({});
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  const activeProjectData = useMemo(() => projects.find((p) => p.id === activeProject), [projects, activeProject]);
  const memberCount = useMemo(() => {
    const uids = new Set(messages.filter((m) => m.senderUid).map((m) => m.senderUid));
    return uids.size || 1;
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  const filteredMessages = useMemo(() => {
    const now = Date.now();
    const live = messages.filter((m) => !m.expiresAt || m.expiresAt > now);
    if (activeTag === 'all') return live;
    return live.filter((m) => (m.tags || []).includes(activeTag));
  }, [messages, activeTag]);

  const groupedSet = useMemo(() => {
    const result = new Set();
    let prev = null;
    filteredMessages.forEach((m) => {
      if (
        prev &&
        m.type === 'text' &&
        prev.type === 'text' &&
        (m.senderUid ? m.senderUid === prev.senderUid : m.senderName === prev.senderName)
      ) {
        result.add(m.id);
      }
      prev = m;
    });
    return result;
  }, [filteredMessages]);

  const announcements = useMemo(() => messages.filter((m) => m.type === 'announce'), [messages]);

  const toggleThread = (mid) => {
    setOpenThreads((prev) => {
      const n = new Set(prev);
      if (n.has(mid)) n.delete(mid); else n.add(mid);
      return n;
    });
  };

  const setReplyValue = (mid, v) => setReplyValues((prev) => ({ ...prev, [mid]: v }));

  const sendReply = async (mid) => {
    const v = (replyValues[mid] || '').trim();
    if (!v) return;
    await addReply(activeProject, mid, { senderName: user?.name, text: v, ts: nowHM() });
    setReplyValues((prev) => ({ ...prev, [mid]: '' }));
  };

  const choose = async (mid, letter) => {
    await updateMessageField(activeProject, mid, { chosen: letter });
  };

  const vote = async (mid, oid) => {
    const m = messages.find((msg) => msg.id === mid);
    if (!m) return;
    const options = (m.options || []).map((o) => {
      const alreadyVoted = (o.votes || []).some((v) => v.uid === user?.uid || v.name === user?.name);
      const filtered = (o.votes || []).filter((v) => v.uid !== user?.uid && v.name !== user?.name);
      if (o.id === oid && !alreadyVoted) {
        return { ...o, votes: [...filtered, { name: user?.name, uid: user?.uid, color: 'oklch(0.45 0.20 270)' }] };
      }
      return { ...o, votes: filtered };
    });
    await updateMessageField(activeProject, mid, { options });
  };

  const actApproval = async (mid, action, heldUntil) => {
    if (action === 'approve') {
      await updateMessageField(activeProject, mid, { status: 'approved' });
      const m = messages.find((msg) => msg.id === mid);
      if (m) {
        await addTask(activeProject, { title: (m.text?.slice(0, 40) || '승인 건') + ' — 후속 처리', fromLead: true, done: true, from: 'approval:' + mid });
      }
    } else if (action === 'reject') {
      await updateMessageField(activeProject, mid, { status: 'rejected' });
    } else if (action === 'hold') {
      await updateMessageField(activeProject, mid, { status: 'held', heldUntil: heldUntil || null });
    }
  };

  const confirmMsg = async (mid) => {
    if (!user?.uid) return;
    await confirmMessage(activeProject, mid, user.uid);
  };

  const nudgeMsg = async (mid) => {
    await nudgeMessage(activeProject, mid);
  };

  const saveMeetingSummary = async (mid, summary) => {
    await updateMessageField(activeProject, mid, { summary });
  };

  const handleSend = async (msgData) => {
    if (!activeProject) return;
    await sendMessage(activeProject, {
      ...msgData,
      senderName: user?.name || '나',
      senderUid: user?.uid,
      senderRole: user?.position || (user?.role === 'lead' ? '팀장' : '팀원'),
      ts: nowHM(),
    });
  };

  // File upload handler
  const handleFiles = async (files) => {
    if (!activeProject || !files?.length) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    try {
      for (const file of Array.from(files)) {
        const isImage = IMAGE_TYPES.includes(file.type);
        const url = await uploadFile(file, setUploadProgress);
        await handleSend({
          type: isImage ? 'image' : 'file',
          fileUrl: url,
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          fileType: file.type,
          text: '',
          tags: [],
        });
      }
    } catch (e) {
      console.error('Upload failed:', e);
      setUploadError('업로드 실패: Firebase Storage가 설정되지 않았거나 권한이 없습니다.');
      setTimeout(() => setUploadError(''), 5000);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); };
  const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); };

  const editMsg = async (mid, newText) => {
    await editMessage(activeProject, mid, newText);
  };

  const deleteMsg = async (mid) => {
    await deleteMessage(activeProject, mid);
  };

  const handlers = {
    openThreads, replyValues,
    toggleThread, setReplyValue, sendReply,
    choose, vote, actApproval, confirmMsg, nudgeMsg,
    saveMeetingSummary,
    editMsg, deleteMsg,
  };

  if (!activeProject) {
    return (
      <main className="col-mid" style={{ display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>프로젝트를 선택하세요</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>좌측에서 프로젝트를 선택하거나 새로 만드세요.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="col-mid" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-inner">
            <div style={{ fontSize: 40 }}>📎</div>
            <div>여기에 파일을 놓으세요</div>
          </div>
        </div>
      )}

      <div className="chat-head">
        <div className="chat-title">
          <span style={{ fontWeight: 800, fontSize: 15 }}>{activeProjectData?.name || activeProject}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-mute)', marginLeft: 10 }}>
            {activeProjectData?.leadName && <span>팀장 {activeProjectData.leadName}</span>}
            {activeProjectData?.leadName && <span style={{ margin: '0 5px' }}>·</span>}
            <span>참여자 {memberCount}명</span>
          </span>
        </div>
        <div className="chat-tabs">
          {[
            { id: 'chat', icon: '💬', label: '채팅', count: messages.length },
            { id: 'tasks', icon: '📋', label: '태스크' },
          ].map((tab) => (
            <button key={tab.id} className={'chat-tab' + (chatTab === tab.id ? ' on' : '')} onClick={() => setChatTab(tab.id)}>
              <span className="ico">{tab.icon}</span> {tab.label}
              {tab.count != null && <span className="mono cnt">{tab.count}</span>}
            </button>
          ))}
        </div>
        {/* Announcements button */}
        {announcements.length > 0 && (
          <div style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0, zIndex: 200 }}>
            <button
              className={'announce-toggle' + (showAnnouncements ? ' on' : '')}
              onClick={() => setShowAnnouncements((v) => !v)}
            >
              📢 공지 <span className="cnt">{announcements.length}</span>
            </button>
            {showAnnouncements && (
              <div className="announce-panel">
                <div className="announce-panel-hd">
                  <span>📢 공지사항</span>
                  <button onClick={() => setShowAnnouncements(false)}>✕</button>
                </div>
                {announcements.map((m) => (
                  <div key={m.id} className="announce-panel-item">
                    <div className="announce-panel-sender">{m.senderName} · {m.ts}</div>
                    <div className="announce-panel-text md-content"><ReactMarkdown>{m.text || ''}</ReactMarkdown></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {chatTab === 'tasks' ? (
        <TasksTab projectId={activeProject} />
      ) : (
        <>
          <TagBar messages={messages} />
          <div className="chat-scroll" ref={scrollRef}>
            {uploading && (
              <div className="upload-progress">
                <div className="upload-bar" style={{ width: uploadProgress + '%' }} />
                <span>업로드 중… {uploadProgress}%</span>
              </div>
            )}
            {uploadError && (
              <div style={{ margin: '6px 20px', padding: '8px 12px', background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 'var(--r-2)', fontSize: 12, color: 'var(--rose)' }}>
                ⚠️ {uploadError}
              </div>
            )}
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                <span className="ai-typing"><span /><span /><span /></span>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>아직 메시지가 없습니다</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>첫 메시지를 보내보세요.</div>
              </div>
            ) : (
              <>
                <div className="day-divider">오늘</div>
                {filteredMessages.map((m) => (
                  <div key={m.id} ref={(el) => { if (msgRefs?.current) msgRefs.current[m.id] = el; }}>
                    <Message m={m} isGrouped={groupedSet.has(m.id)} handlers={handlers} />
                  </div>
                ))}
              </>
            )}
          </div>
          <Composer onSend={handleSend} onFileSelect={handleFiles} fileInputRef={fileInputRef} />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
      )}
    </main>
  );
}
