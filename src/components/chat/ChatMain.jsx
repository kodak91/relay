import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import useAppStore from '../../store/appStore';
import { useMessages } from '../../hooks/useMessages';
import { useProjects } from '../../hooks/useProjects';
import { useTasks } from '../../hooks/useTasks';
import Message from './Message';
import Composer from './Composer';
import TagBar from './TagBar';
import TasksTab from '../tasks/TasksTab';
import MemberManagementModal from './MemberManagementModal';
import KBTab from '../kb/KBTab';
import KBSaveBanner from '../kb/KBSaveBanner';
import MeetingScheduleModal from './MeetingModal';
import NotionTab from '../notion/NotionTab';
import TicketTab from '../tickets/TicketTab';
import { useTickets } from '../../hooks/useTickets';
import { useKB } from '../../hooks/useKB';
import { uploadFile, IMAGE_TYPES, formatFileSize } from '../../lib/uploadFile';
import { postToSlack, slackBotPost, slackBotUpdate, slackBotDelete } from '../../lib/slack';
import { claudeComplete } from '../../lib/claude';
import { addDoc, collection, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatTaskDate } from '../../hooks/usePersonalTasks';

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function msgDateStr(m) {
  const ts = m.createdAt?.toDate?.();
  return ts ? ts.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function formatDividerLabel(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return '오늘';
  if (dateStr === yest) return '어제';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function ChatMain({ msgRefs, onJumpToMessage }) {
  const { activeProject, chatTab, setChatTab, activeTag, user } = useAppStore();
  const { messages, loading, sendMessage, addReply, updateMessageField, confirmMessage, nudgeMessage, deleteMessage, editMessage } = useMessages(activeProject);
  const { projects, updateProject, approveMember, rejectMember, removeMember } = useProjects(user?.uid);
  const { tickets, createTicket, updateTicket, deleteTicket } = useTickets(activeProject);
  const { folders: kbFolders, saveFromChat: saveToKB } = useKB(activeProject);
  const { addTask } = useTasks(activeProject);
  const scrollRef = useRef(null);

  // column-reverse: scrollTop=0 = visual bottom, no JS scroll needed on mount
  const scrollElRef = useCallback((node) => {
    scrollRef.current = node;
  }, []);

  const [openThreads, setOpenThreads] = useState(new Set());
  const [replyValues, setReplyValues] = useState({});
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [pendingKBSave, setPendingKBSave] = useState(null); // { files, selectedFolderId }
  const [showMeeting, setShowMeeting] = useState(false);
  const [meetingInitialTitle, setMeetingInitialTitle] = useState('');
  const [floatingDate, setFloatingDate] = useState('');
  const floatTimerRef = useRef(null);
  const [slackError, setSlackError] = useState('');
  const slackErrTimer = useRef(null);

  const showSlackError = (msg) => {
    setSlackError(msg);
    clearTimeout(slackErrTimer.current);
    slackErrTimer.current = setTimeout(() => setSlackError(''), 7000);
  };

  const activeProjectData = useMemo(() => projects.find((p) => p.id === activeProject), [projects, activeProject]);

  // With column-reverse, scrollTop=0 is visual bottom.
  // If user is already near bottom, keep them there as new messages arrive.
  useEffect(() => {
    if (!scrollRef.current || loading) return;
    if (scrollRef.current.scrollTop < 80) scrollRef.current.scrollTop = 0;
  }, [messages.length, loading]);

  const filteredMessages = useMemo(() => {
    const now = Date.now();
    const live = messages.filter((m) => !m.expiresAt || m.expiresAt > now);
    if (activeTag === 'all') return live;
    return live.filter((m) => (m.tags || []).includes(activeTag));
  }, [messages, activeTag]);

  const { groupedSet, groupStartSet } = useMemo(() => {
    const grouped = new Set();
    const groupStart = new Set();
    let prev = null;
    filteredMessages.forEach((m) => {
      if (
        prev &&
        m.type === 'text' &&
        prev.type === 'text' &&
        msgDateStr(m) === msgDateStr(prev) &&
        (m.senderUid ? m.senderUid === prev.senderUid : m.senderName === prev.senderName)
      ) {
        grouped.add(m.id);
        groupStart.add(prev.id);
      }
      prev = m;
    });
    return { groupedSet: grouped, groupStartSet: groupStart };
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
    } else if (action === 'complete') {
      await updateMessageField(activeProject, mid, { status: 'done' });
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

  const handleOpenMeeting = (title = '') => {
    setMeetingInitialTitle(title);
    setShowMeeting(true);
  };

  const handlePostMeeting = async (meetingData) => {
    await handleSend({
      type: 'meeting',
      text: meetingData.meetingTitle,
      agenda: meetingData.agenda,
      participants: meetingData.participants,
      transcript: meetingData.transcript,
      minutes: meetingData.minutes,
      duration: meetingData.duration,
      tags: [],
    });
  };

  const handleSendMeetingInvite = async (data) => {
    await handleSend({
      type: 'meeting_invite',
      text: data.title,
      agenda: data.agenda,
      scheduledAt: data.scheduledAt,
      participants: data.participants,
      rsvp: {},
      tags: [],
    });
  };

  const rsvpMeeting = async (mid, response) => {
    if (!user?.uid) return;
    const m = messages.find((msg) => msg.id === mid);
    if (!m) return;
    const rsvp = { ...(m.rsvp || {}) };
    if (response === null) {
      delete rsvp[user.uid];
    } else {
      rsvp[user.uid] = response;
    }
    await updateMessageField(activeProject, mid, { rsvp });
  };

  const handleSend = async (rawMsgData) => {
    if (!activeProject) return;
    let msgData = rawMsgData;

    // Ticket: create Firestore doc first to get ticketCode + ID for the chat message
    if (msgData.type === 'ticket') {
      const ticketCode = `${activeProjectData?.pf || 'T'}-${String(tickets.length + 1).padStart(3, '0')}`;
      try {
        const docRef = await createTicket({
          ticketCode,
          title: msgData.ticketTitle || msgData.text,
          description: msgData.ticketDesc || '',
          assigneeUid: msgData.assigneeUid || null,
          assigneeName: msgData.assigneeName || null,
          dueDate: msgData.dueDate || null,
          priority: msgData.ticketPriority || '보통',
          status: '열림',
          parentId: null,
          createdBy: user?.uid,
          x: 80 + Math.random() * 500,
          y: 80 + Math.random() * 150,
        });
        msgData = { ...msgData, ticketId: docRef?.id || null, ticketCode };
      } catch (e) {
        console.warn('Ticket create:', e.message);
      }
    }

    const msgRef = await sendMessage(activeProject, {
      ...msgData,
      senderName: user?.name || '나',
      senderUid: user?.uid,
      senderRole: user?.position || (user?.role === 'lead' ? '팀장' : '팀원'),
      ts: nowHM(),
    });

    // Slack: /보고 messages (bot token preferred for edit/delete tracking; fallback to webhook)
    if (msgData.type === 'update') {
      const slackText = `📊 *[${activeProjectData?.name}] 중간 보고* — ${user?.name || '팀원'}\n${msgData.text || ''}`;
      if (activeProjectData?.slackBotToken && activeProjectData?.slackChannel) {
        slackBotPost(activeProjectData.slackBotToken, activeProjectData.slackChannel, slackText)
          .then((ts) => {
            if (ts && msgRef) {
              updateDoc(msgRef, { slackTs: ts, slackChannel: activeProjectData.slackChannel }).catch(() => {});
            }
          })
          .catch((e) => {
            console.warn('Slack bot post:', e.message);
            showSlackError(`Slack 전송 실패: ${e.message}`);
          });
      } else if (activeProjectData?.slackWebhook) {
        postToSlack(activeProjectData.slackWebhook, slackText).catch((e) => console.warn('Slack:', e.message));
      }
    }

    // @assign: write task to assignee's personal task list
    if (msgData.type === 'assign' && msgData.assigneeUid && msgData.text?.trim()) {
      addDoc(collection(db, 'users', msgData.assigneeUid, 'tasks'), {
        title: msgData.text.trim(),
        done: false,
        date: formatTaskDate(),
        assignedBy: user?.name || '팀원',
        assignedFrom: 'chat',
        createdAt: serverTimestamp(),
      }).catch((e) => console.warn('Assign task write:', e.message));
    }
  };

  // File upload: called from Composer on send. kbFolderId='__manual__' → show banner; folder ID → auto-save; null → no save.
  const handleFiles = async (files, kbFolderId = null, caption = '') => {
    if (!activeProject || !files?.length) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    const kbPending = [];
    const autoSave = kbFolderId && kbFolderId !== '__manual__';
    try {
      const fileArr = Array.from(files);
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        const isImage = IMAGE_TYPES.includes(file.type);
        const url = await uploadFile(file, setUploadProgress);
        // First file carries the caption text; subsequent files are clean
        await handleSend({
          type: isImage ? 'image' : 'file',
          fileUrl: url,
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          fileType: file.type,
          text: i === 0 ? caption : '',
          tags: i === 0 ? (caption.match(/#\S+/g) || []) : [],
        });
        kbPending.push({
          name: file.name,
          ext: file.name.split('.').pop().toLowerCase(),
          fileUrl: url,
          size: formatFileSize(file.size),
          blob: file,
        });
      }
      if (autoSave && kbPending.length > 0) {
        // Auto-save to selected KB/Drive folder (falls back to Firebase Storage URL if no Drive token)
        for (const f of kbPending) {
          try {
            await saveToKB({
              ...f,
              folderId: kbFolderId,
              uploader: user?.name || '',
              uploaderUid: user?.uid || '',
              token: null,
            });
          } catch (e) {
            console.warn('Auto KB save:', e.message);
          }
        }
      } else if (kbPending.length > 0) {
        // Show manual save banner (folder pre-selected if '__manual__' chosen)
        setPendingKBSave({ files: kbPending, selectedFolderId: null });
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
    const m = messages.find((msg) => msg.id === mid);
    if (m?.slackTs && activeProjectData?.slackBotToken && m.slackChannel) {
      const slackText = `📊 *[${activeProjectData?.name}] 중간 보고* — ${m.senderName || ''}\n${newText}`;
      slackBotUpdate(activeProjectData.slackBotToken, m.slackChannel, m.slackTs, slackText)
        .catch((e) => console.warn('Slack update:', e.message));
    }
  };

  const editMsgFields = async (mid, fields) => {
    await updateDoc(doc(db, 'projects', activeProject, 'messages', mid), {
      ...fields,
      editedAt: new Date().toISOString(),
    });
  };

  const deleteMsg = async (mid) => {
    const m = messages.find((msg) => msg.id === mid);
    await deleteMessage(activeProject, mid);
    if (m?.slackTs && activeProjectData?.slackBotToken && m.slackChannel) {
      slackBotDelete(activeProjectData.slackBotToken, m.slackChannel, m.slackTs)
        .catch((e) => console.warn('Slack delete:', e.message));
    }
  };

  // Task 3+4: Add task from message (태스크+) with notification
  const addTaskFromMessage = async (member, msg) => {
    if (!member?.uid || !msg) return;
    const taskTitle = (msg.text || '').slice(0, 80) || '메시지 기반 태스크';
    await addDoc(collection(db, 'users', member.uid, 'tasks'), {
      title: taskTitle,
      done: false,
      date: formatTaskDate(),
      assignedBy: user?.name || '팀원',
      assignedFrom: 'chat',
      fromMessageId: msg.id,
      createdAt: serverTimestamp(),
    });
    // Task 4: notification
    await addDoc(collection(db, 'notifications', member.uid, 'items'), {
      type: 'task_assigned',
      title: '새 태스크가 추가되었습니다',
      body: taskTitle,
      fromName: user?.name || '팀원',
      read: false,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  // Task 8: PM AI command handler
  const PM_SYSTEM = '당신은 이 워크스페이스의 PM AI입니다. 회의/티켓/태스크/요약 등 팀 운영 전반을 처리합니다. 한국어로 간결하고 실용적으로 답변하세요.';
  const handlePMAI = async (query) => {
    if (!query.trim() || !activeProject) return;
    try {
      const response = await claudeComplete(query, PM_SYSTEM);
      await handleSend({
        type: 'ai',
        title: `PM AI — ${query.slice(0, 40)}`,
        text: response,
        tags: [],
      });
    } catch (e) {
      console.warn('PM AI:', e.message);
    }
  };

  const addReaction = async (mid, emoji) => {
    if (!user?.uid) return;
    const m = messages.find((msg) => msg.id === mid);
    if (!m) return;
    const reactions = [...(m.reactions || [])];
    const idx = reactions.findIndex((r) => r.e === emoji);
    if (idx >= 0) {
      const uids = reactions[idx].uids || [];
      const newUids = uids.includes(user.uid)
        ? uids.filter((u) => u !== user.uid)
        : [...uids, user.uid];
      if (newUids.length === 0) reactions.splice(idx, 1);
      else reactions[idx] = { ...reactions[idx], uids: newUids };
    } else {
      reactions.push({ e: emoji, uids: [user.uid] });
    }
    await updateMessageField(activeProject, mid, { reactions });
  };

  const handleChatScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const cTop = container.getBoundingClientRect().top;
    // In column-reverse layout, find the divider whose rect.top is closest to
    // (but not below) the container's top — that's the current visible section.
    let label = '';
    let maxTop = -Infinity;
    container.querySelectorAll('[data-date]').forEach((div) => {
      const rect = div.getBoundingClientRect();
      if (rect.top <= cTop + 50 && rect.top > maxTop) {
        maxTop = rect.top;
        label = div.getAttribute('data-date');
      }
    });
    if (label) setFloatingDate(label);
    clearTimeout(floatTimerRef.current);
    floatTimerRef.current = setTimeout(() => setFloatingDate(''), 1500);
  }, []);

  const handlers = {
    openThreads, replyValues,
    toggleThread, setReplyValue, sendReply,
    choose, vote, actApproval, confirmMsg, nudgeMsg,
    saveMeetingSummary, rsvpMeeting,
    editMsg, editMsgFields, deleteMsg, addReaction,
    members: activeProjectData?.members || [],
    addTaskFromMessage,
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
            {activeProjectData?.leadName && <span>팀장 {activeProjectData.leadName} · </span>}
            <button className="member-mgmt-btn" onClick={() => setShowMemberModal(true)}>
              멤버관리
            </button>
          </span>
        </div>
        <div className="chat-tabs">
          {[
            { id: 'chat', icon: '💬', label: '채팅' },
            { id: 'kb', icon: '📚', label: 'KB', count: null },
            { id: 'notion', icon: '🔖', label: '북마크', count: null },
            { id: 'tickets', icon: '🎫', label: '워크트리', count: tickets.length || null },
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
                    <div className="announce-panel-text md-content"><ReactMarkdown components={{ a: ({href, children}) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}>{m.text || ''}</ReactMarkdown></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {slackError && (
        <div style={{
          background: 'oklch(0.95 0.04 25)', border: '1px solid oklch(0.85 0.10 25)',
          color: 'oklch(0.40 0.15 25)', fontSize: 12, padding: '7px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>⚠️ {slackError}</span>
          <button onClick={() => setSlackError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, padding: '0 2px' }}>✕</button>
        </div>
      )}

      {showMemberModal && activeProjectData && (
        <MemberManagementModal
          project={activeProjectData}
          user={user}
          onClose={() => setShowMemberModal(false)}
          onApprove={(uid) => approveMember(activeProject, uid)}
          onReject={(uid) => rejectMember(activeProject, uid)}
          onRemove={(uid) => removeMember(activeProject, uid)}
        />
      )}

      <MeetingScheduleModal
        open={showMeeting}
        onClose={() => setShowMeeting(false)}
        members={activeProjectData?.members || []}
        initialTitle={meetingInitialTitle}
        projectId={activeProject}
        user={user}
        onPostToChat={handleSendMeetingInvite}
      />

      {chatTab === 'kb' ? (
        <KBTab projectId={activeProject} members={activeProjectData?.members || []} onPostMeeting={handlePostMeeting} />
      ) : chatTab === 'notion' ? (
        <NotionTab
          projectId={activeProject}
          project={activeProjectData}
          updateProject={(fields) => updateProject(activeProject, fields)}
        />
      ) : chatTab === 'tickets' ? (
        <TicketTab
          projectId={activeProject}
          project={activeProjectData}
          tickets={tickets}
          createTicket={createTicket}
          updateTicket={updateTicket}
          deleteTicket={deleteTicket}
          user={user}
        />
      ) : chatTab === 'tasks' ? (
        <TasksTab projectId={activeProject} project={activeProjectData} tickets={tickets} />
      ) : (
        <>
          <TagBar messages={messages} />
          {floatingDate && <div className="chat-date-float">{floatingDate}</div>}
          <div className="chat-scroll" ref={scrollElRef} onScroll={handleChatScroll}>
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
                {(() => {
                  // Build in chronological order, then reverse for column-reverse layout.
                  // column-reverse: first DOM element = visual bottom → newest messages at bottom.
                  const items = [];
                  let lastDate = null;
                  filteredMessages.forEach((m) => {
                    const d = msgDateStr(m);
                    if (d !== lastDate) {
                      const label = formatDividerLabel(d);
                      items.push(<div key={'div-' + d} className="day-divider" data-date={label}>{label}</div>);
                      lastDate = d;
                    }
                    items.push(
                      <div key={m.id} ref={(el) => { if (msgRefs?.current) msgRefs.current[m.id] = el; }}>
                        <Message m={m} isGrouped={groupedSet.has(m.id)} isGroupStart={groupStartSet.has(m.id)} handlers={handlers} />
                      </div>
                    );
                  });
                  return items.reverse();
                })()}
              </>
            )}
          </div>
          {pendingKBSave && (
            <KBSaveBanner
              projectId={activeProject}
              files={pendingKBSave.files || pendingKBSave}
              initialFolderId={pendingKBSave.selectedFolderId || null}
              user={user}
              onSave={() => setPendingKBSave(null)}
              onDismiss={() => setPendingKBSave(null)}
            />
          )}
          <Composer
            onSend={handleSend}
            onFileUpload={handleFiles}
            onOpenMeeting={handleOpenMeeting}
            onPMAI={handlePMAI}
            members={activeProjectData?.members || []}
            kbFolders={kbFolders}
            recentMessages={messages.slice(-8)}
          />
        </>
      )}
    </main>
  );
}
