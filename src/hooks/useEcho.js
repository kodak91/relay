import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import useAppStore from '../store/appStore';

// Echo Phase 1 — 역할 캡슐 조회/실행 훅
// 읽기: projects/{projectId}/echoCapsules (구독)
// 실행: /api/echo-capture (서버리스, Claude 생성 + Firestore 저장)
// 권한: lead 는 전체 / member 는 본인 캡슐만
export function useEcho(projectId) {
  const user = useAppStore((s) => s.user);
  const [capsules, setCapsules] = useState([]);
  const [loading, setLoading] = useState(true);

  const isLead = user?.role === 'lead';

  useEffect(() => {
    if (!projectId) { setCapsules([]); setLoading(false); return; }
    setLoading(true);
    const col = collection(db, 'projects', projectId, 'echoCapsules');
    return onSnapshot(col, (snap) => {
      setCapsules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [projectId]);

  // member 는 본인 memberId 캡슐만 열람 가능
  const visibleCapsules = isLead ? capsules : capsules.filter((c) => c.id === user?.uid);

  const getCapsule = (memberId) => capsules.find((c) => c.id === memberId) || null;

  // 팀장이 특정 멤버 캡슐을 생성/업데이트
  const runCapture = async (member) => {
    if (!isLead) throw new Error('팀장만 Echo를 실행할 수 있습니다.');
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.');
    const res = await fetch('/api/echo-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        memberId: member.uid,
        memberName: member.name,
        role: member.role || 'member',
        idToken,
        requesterUid: user?.uid,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Echo 실행 실패 (${res.status})`);
    }
    return res.json();
  };

  // 캡슐 버전 이력 조회 (덮어쓰기 방지 — 스냅샷 목록)
  const getVersions = async (memberId) => {
    const q = query(
      collection(db, 'projects', projectId, 'echoCapsules', memberId, 'versions'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  // 워크스페이스 장의 Echo 기능 on/off (project 문서 echoEnabled)
  const setEchoEnabled = (enabled) =>
    updateDoc(doc(db, 'projects', projectId), { echoEnabled: enabled });

  return { capsules: visibleCapsules, allCapsules: capsules, loading, isLead, runCapture, getCapsule, getVersions, setEchoEnabled };
}
