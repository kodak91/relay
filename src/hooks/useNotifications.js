import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, writeBatch, doc, updateDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// 알림 카테고리별 on/off 기본값. users/{uid}.notifPrefs 에 저장.
// - general    : 나를 향한 일반 알림 (태스크 배정, 승인/결정 결과, 보류 재활성 등)
// - featureChat: 내가 대상인 기능(/) 메시지 (결정/승인/투표 요청)
// - myThread   : 내 글에 달린 스레드(댓글)
// - allThread  : 내가 참여한 스레드의 새 댓글
export const DEFAULT_NOTIF_PREFS = { general: true, featureChat: true, myThread: true, allThread: false };

// 알림 문서의 category → prefs 키 매핑 (누락 시 general 취급)
function prefKeyFor(category) {
  if (category === 'myThread') return 'myThread';
  if (category === 'allThread') return 'allThread';
  if (category === 'featureChat') return 'featureChat';
  return 'general';
}

export function useNotifications(uid) {
  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_NOTIF_PREFS);

  useEffect(() => {
    if (!uid) { setItems([]); return; }
    const q = query(
      collection(db, 'notifications', uid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  // 사용자 알림 설정 구독
  useEffect(() => {
    if (!uid) { setPrefs(DEFAULT_NOTIF_PREFS); return; }
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      const p = snap.exists() ? snap.data().notifPrefs : null;
      setPrefs({ ...DEFAULT_NOTIF_PREFS, ...(p || {}) });
    });
  }, [uid]);

  const isEnabled = (n) => prefs[prefKeyFor(n.category)] !== false;

  // 설정에서 켜진 카테고리만 노출 (뱃지/목록 모두 이 기준)
  const visibleItems = items.filter(isEnabled);
  const unreadItems = visibleItems.filter((n) => !n.read);
  const unreadCount = unreadItems.length;

  const markRead = async (id) => {
    if (!uid || !id) return;
    await updateDoc(doc(db, 'notifications', uid, 'items', id), { read: true }).catch(() => {});
  };

  const markAllRead = async () => {
    const unread = visibleItems.filter((n) => !n.read);
    if (!uid || unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, 'notifications', uid, 'items', n.id), { read: true });
    });
    await batch.commit().catch(() => {});
  };

  const setPref = async (key, value) => {
    if (!uid) return;
    setPrefs((prev) => ({ ...prev, [key]: value })); // 낙관적 업데이트
    await setDoc(doc(db, 'users', uid), { notifPrefs: { [key]: value } }, { merge: true }).catch(() => {});
  };

  return { items: visibleItems, unreadItems, unreadCount, prefs, setPref, markRead, markAllRead };
}

// 알림 생성 헬퍼 — 여러 곳에서 재사용. 수신자 uid 에게 category 별 알림 기록.
// (수신자 설정 필터링은 읽기 시점에 useNotifications 가 처리)
export async function pushNotif(uid, { type = 'general', category = 'general', title, body, fromName }) {
  if (!uid) return;
  await addDoc(collection(db, 'notifications', uid, 'items'), {
    type,
    category,
    title: title || '',
    body: (body || '').slice(0, 80),
    fromName: fromName || '',
    read: false,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
