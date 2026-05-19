import { useRef, useEffect, useState, useMemo } from 'react';
import useAppStore from '../../store/appStore';
import { useMessages } from '../../hooks/useMessages';
import { useTasks } from '../../hooks/useTasks';
import Message from './Message';
import Composer from './Composer';
import TagBar from './TagBar';
import TasksTab from '../tasks/TasksTab';
import { serverTimestamp } from 'firebase/firestore';

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export default function ChatMain({ msgRefs, onJumpToMessage }) {
  const { activeProject, chatTab, setChatTab, activeTag, user } = useAppStore();
  const { messages, loading, sendMessage, addReply, updateMessageField } = useMessages(activeProject);
  const { addTask } = useTasks(activeProject);
  const scrollRef = useRef(null);

  // Local state for thread interaction (UI only)
  const [openThreads, setOpenThreads] = useState(new Set());
  const [replyValues, setReplyValues] = useState({});

  const project = activeProject;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  const filteredMessages = useMemo(() => {
    const now = Date.now();
    const live = messages.filter((m) => !m.expiresAt || m.expiresAt > now);
    if (activeTag === 'all') return live;
    const tagName = { print: '#인쇄', design: '#디자인', logi: '#물류', money: '#발주', meet: '#회의' }[activeTag];
    return tagName ? live.filter((m) => (m.tags || []).includes(tagName)) : live;
  }, [messages, activeTag]);

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
      const wasVoted = o.id === oid && o.voted;
      const filtered = (o.votes || []).filter((v) => v.name !== user?.name);
      if (o.id === oid && !wasVoted) return { ...o, voted: true, votes: [...filtered, { name: user?.name, color: 'oklch(0.45 0.20 270)' }] };
      return { ...o, voted: o.id === oid ? false : o.voted, votes: filtered };
    });
    await updateMessageField(activeProject, mid, { options });
  };

  const actApproval = async (mid, action) => {
    const status = action === 'approve' ? 'approved' : 'rejected';
    await updateMessageField(activeProject, mid, { status });
    if (action === 'approve') {
      const m = messages.find((msg) => msg.id === mid);
      if (m?.title) {
        await addTask(activeProject, { title: m.title + ' — 후속 처리', fromLead: true, from: 'approval:' + mid });
      }
    }
  };

  const handleSend = async (msgData) => {
    if (!activeProject) return;
    await sendMessage(activeProject, {
      ...msgData,
      senderName: user?.name || '나',
      senderRole: user?.role === 'lead' ? '팀장' : '팀원',
      ts: nowHM(),
    });
  };

  const handlers = {
    openThreads, replyValues,
    toggleThread, setReplyValue, sendReply,
    choose, vote, actApproval,
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
    <main className="col-mid">
      {/* Chat head */}
      <div className="chat-head">
        <div className="chat-title">
          <div style={{ fontWeight: 800, fontSize: 15 }}>{activeProject}</div>
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
      </div>

      {chatTab === 'tasks' ? (
        <TasksTab projectId={activeProject} />
      ) : (
        <>
          <TagBar messages={messages} />
          <div className="chat-scroll" ref={scrollRef}>
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
                    <Message m={m} handlers={handlers} />
                  </div>
                ))}
              </>
            )}
          </div>
          <Composer onSend={handleSend} />
        </>
      )}
    </main>
  );
}
