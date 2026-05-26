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
import { postToSlack } from '../../lib/slack';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export default function ChatMain({ msgRefs, onJumpToMessage }) {
  const { activeProject, chatTab, setChatTab, activeTag, user } = useAppStore();
  const { messages, loading, sendMessage, addReply, updateMessageField, confirmMessage, nudgeMessage, deleteMessage, editMessage } = useMessages(activeProject);
  const { projects, updateProject, approveMember, rejectMember, removeMember } = useProjects(user?.uid);
  const { tickets, createTicket, updateTicket } = useTickets(activeProject);
  const { folders: kbFolders, saveFromChat: saveToKB } = useKB(activeProject);
  const { addTask } = useTasks(activeProject);
  const scrollRef = useRef(null);
  const initialScrollDone = useRef(false);

  // Reset when project changes so initial scroll fires again
  useEffect(() => { initialScrollDone.current = false; }, [activeProject]);

  // Callback ref: instantly jumps to bottom when chat-scroll div mounts (tab switch)
  const scrollElRef = useCallback((node) => {
    scrollRef.current = node;
    if (node) node.scrollTop = node.scrollHeight;
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

  const activeProjectData = useMemo(() => projects.find((p) => p.id === activeProject), [projects, activeProject]);

  // Initial load: instant jump. Subsequent new messages: smooth scroll.
  useEffect(() => {
    if (!scrollRef.current || loading) return;
    if (!initialScrollDone.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      initialScrollDone.current = true;
    } else {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
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

    await sendMessage(activeProject, {
      ...msgData,
      senderName: user?.name || '나',
      senderUid: user?.uid,
      senderRole: user?.position || (user?.role === 'lead' ? '팀장' : '팀원'),
      ts: nowHM(),
    });

    // Slack: /보고 messages
    if (msgData.type === 'update' && activeProjectData?.slackWebhook) {
      postToSlack(
        activeProjectData.slackWebhook,
        `📊 *[${activeProjectData.name}] 중간 보고* — ${user?.name || '팀원'}\n${msgData.text || ''}`
      ).catch((e) => console.warn('Slack:', e.message));
    }

    // @assign: write task to assignee's personal task list
    if (msgData.type === 'assign' && msgData.assigneeUid && msgData.text?.trim()) {
      addDoc(collection(db, 'users', msgData.assigneeUid, 'tasks'), {
        title: msgData.text.trim(),
        done: false,
        date: new Date().toISOString().slice(0, 10),
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
  };

  const deleteMsg = async (mid) => {
    await deleteMessage(activeProject, mid);
  };

  const handlers = {
    openThreads, replyValues,
    toggleThread, setReplyValue, sendReply,
    choose, vote, actApproval, confirmMsg, nudgeMsg,
    saveMeetingSummary, rsvpMeeting,
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
          user={user}
        />
      ) : chatTab === 'tasks' ? (
        <TasksTab projectId={activeProject} project={activeProjectData} tickets={tickets} />
      ) : (
        <>
          <TagBar messages={messages} />
          <div className="chat-scroll" ref={scrollElRef}>
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
                    <Message m={m} isGrouped={groupedSet.has(m.id)} isGroupStart={groupStartSet.has(m.id)} handlers={handlers} />
                  </div>
                ))}
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
            members={activeProjectData?.members || []}
            kbFolders={kbFolders}
          />
        </>
      )}
    </main>
  );
}
