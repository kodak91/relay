import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// 개인 비서 전용 데이터. firestore.rules에서 isLead(pid)로만 열람 가능 —
// 팀원에게는 이 컬렉션 자체가 쿼리되지 않는다.
export function useAideMemory(projectId) {
  const [memories, setMemories] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setMemories([]); setLoading(false); return; }
    const q = query(collection(db, 'projects', projectId, 'aideMemory'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMemories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  useEffect(() => {
    if (!projectId) { setProfile(null); return; }
    getDoc(doc(db, 'projects', projectId, 'aideProfile', 'main'))
      .then((snap) => setProfile(snap.exists() ? snap.data() : null))
      .catch(() => setProfile(null));
  }, [projectId]);

  const remember = async (text) => {
    await addDoc(collection(db, 'projects', projectId, 'aideMemory'), {
      text,
      createdAt: serverTimestamp(),
    });
  };

  const saveProfile = async (data) => {
    await setDoc(doc(db, 'projects', projectId, 'aideProfile', 'main'), data, { merge: true });
    setProfile((p) => ({ ...(p || {}), ...data }));
  };

  return { memories, profile, loading, remember, saveProfile };
}
