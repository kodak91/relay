import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import useAppStore from '../store/appStore';

// 어디서든(데스크톱 알림·알림함·사이드바) "이 메시지로 이동".
// 다른 프로젝트의 메시지면 프로젝트부터 전환하고 채팅 탭으로 옮긴 뒤
// pendingJumpTarget 을 세팅한다. 실제 스크롤·하이라이트는 ChatMain 이 처리.
// target 은 메시지 id 문자열 또는 메시지 객체. 객체에 createdAt 이 없으면
// (알림 문서엔 id 만 들어있다) 문서를 한 번 읽어와서 채운다 —
// useMessageContext 가 createdAt 기준으로 앞뒤 맥락을 불러오기 때문.
export async function navigateToMessage(projectId, target) {
  const mid = typeof target === 'string' ? target : target?.id;
  if (!projectId || !mid) return;

  const s = useAppStore.getState();
  if (s.activeProject !== projectId) s.setActiveProject(projectId);
  s.setActiveChannel('chat');
  s.setChatTab('chat');
  s.setActiveTag('all'); // 태그 필터가 걸려 있으면 대상 메시지가 가려진다

  let msg = typeof target === 'object' ? target : null;
  if (!msg?.createdAt) {
    const snap = await getDoc(doc(db, 'projects', projectId, 'messages', mid)).catch(() => null);
    if (!snap?.exists()) return;
    msg = { id: snap.id, ...snap.data() };
  }
  useAppStore.getState().setPendingJumpTarget(msg);
}

// 데스크톱(윈도우) 알림 — 클릭하면 창을 앞으로 띄우고 해당 메시지로 이동.
// link 는 { projectId, messageId } 또는 { projectId, message } 형태.
export function showDesktopNotification(title, { body, link } = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  let n;
  try {
    n = new Notification(title, { body: body || '', icon: '/icon-192.png', tag: link?.messageId || undefined });
  } catch {
    return null; // 일부 브라우저는 SW 없이 생성 시 throw
  }
  n.onclick = () => {
    window.focus();
    n.close();
    const pid = link?.projectId;
    const t = link?.message || link?.messageId;
    if (pid && t) navigateToMessage(pid, t);
  };
  return n;
}
