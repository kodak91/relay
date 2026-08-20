import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

const CONTEXT_SIZE = 30;

// 슬랙식 "메시지로 이동" — 검색 결과 등에서 로드 범위 밖의(과거) 메시지를
// 클릭하면, 전체 히스토리를 불러오는 대신 그 메시지를 중심으로 앞뒤 일정
// 개수만 별도로 조회해서 보여준다. target은 최소 { id, createdAt }를 가진
// 메시지 객체여야 한다(createdAt 기준으로 앞뒤를 나눠서 조회하므로).
export function useMessageContext(projectId, target) {
  const [context, setContext] = useState(null); // { anchorId, messages }

  useEffect(() => {
    if (!projectId || !target?.id || !target?.createdAt) { setContext(null); return; }
    let cancelled = false;
    const col = collection(db, 'projects', projectId, 'messages');
    Promise.all([
      getDocs(query(col, where('createdAt', '<=', target.createdAt), orderBy('createdAt', 'desc'), limit(CONTEXT_SIZE + 1))),
      getDocs(query(col, where('createdAt', '>', target.createdAt), orderBy('createdAt', 'asc'), limit(CONTEXT_SIZE))),
    ]).then(([beforeSnap, afterSnap]) => {
      if (cancelled) return;
      const beforeMsgs = beforeSnap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      const afterMsgs = afterSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setContext({ anchorId: target.id, messages: [...beforeMsgs, ...afterMsgs] });
    }).catch(() => { if (!cancelled) setContext(null); });
    return () => { cancelled = true; };
  }, [projectId, target?.id, target?.createdAt]);

  return { context };
}
