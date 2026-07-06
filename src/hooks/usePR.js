import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import useAppStore from '../store/appStore';

// Relay Scope > PR — 분기 성과 평가 훅 (lead 전용)
// 실행: /api/pr-evaluate. 저장: projects/{pid}/evaluations/{memberId}/quarters/{quarterId}
export function usePR(projectId) {
  const user = useAppStore((s) => s.user);
  const isLead = user?.role === 'lead';

  const runEvaluation = async ({ memberId, memberName, role, quarterId, periodStart, periodEnd }) => {
    if (!isLead) throw new Error('팀장/대표만 성과 평가를 실행할 수 있습니다.');
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
    const res = await fetch('/api/pr-evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, memberId, memberName, role, quarterId, periodStart, periodEnd, idToken, requesterUid: user?.uid }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `평가 실행 실패 (${res.status})`);
    }
    return res.json();
  };

  return { isLead, runEvaluation };
}

// 특정 멤버의 분기 평가 목록 구독
export function useEvaluations(projectId, memberId) {
  const [evaluations, setEvaluations] = useState([]);

  useEffect(() => {
    if (!projectId || !memberId) { setEvaluations([]); return; }
    const col = collection(db, 'projects', projectId, 'evaluations', memberId, 'quarters');
    return onSnapshot(col, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.id < b.id ? 1 : -1)); // 최신 분기 먼저
      setEvaluations(docs);
    });
  }, [projectId, memberId]);

  return evaluations;
}
