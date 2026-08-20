import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

// 채팅 화면은 최근 메시지 창(useMessages)만 구독하지만, 태그로 필터링할 때는
// 그 창 밖의 오래된 메시지도 사라지면 안 된다. 태그가 붙은 메시지는 전체
// 대비 소수이므로, 해당 태그를 가진 메시지 전체를 array-contains로 직접
// 가져오는 편이 전체 히스토리를 훑는 것보다 훨씬 가볍다.
export function useTaggedMessages(projectId, tag) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!projectId || !tag) { setMessages([]); return; }
    const q = query(
      collection(db, 'projects', projectId, 'messages'),
      where('tags', 'array-contains', tag)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return at - bt;
      });
      setMessages(list);
    });
    return unsub;
  }, [projectId, tag]);

  return { messages };
}
