import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function taskDate(t) {
  if (t.date) return t.date;
  const ts = t.createdAt?.toDate?.();
  return ts ? ts.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

export function useTeamTasks(members) {
  const [memberTasks, setMemberTasks] = useState({});
  const memberKey = (members || []).map((m) => m.uid).filter(Boolean).join(',');

  useEffect(() => {
    if (!memberKey) { setMemberTasks({}); return; }
    const data = {};
    const unsubs = (members || []).filter((m) => m.uid).map((m) => {
      const q = query(collection(db, 'users', m.uid, 'tasks'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        data[m.uid] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMemberTasks({ ...data });
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [memberKey]); // eslint-disable-line

  const toggleTask = async (uid, taskId, done) => {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), { done });
  };

  const updateTask = async (uid, taskId, fields) => {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), fields);
  };

  return { memberTasks, toggleTask, updateTask };
}
