import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, addDoc, serverTimestamp } from 'firebase/firestore';
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

  const toggleTask = async (uid, taskId, done, task) => {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), { done });
    if (done && task?.ticketId && task?.ticketProjectId) {
      const historyEntry = {
        type: 'task_completed',
        taskId,
        taskTitle: task.title || '',
        detail: task.detail || '',
        memberUid: uid,
        memberName: task.memberName || '',
        completedAt: new Date().toISOString(),
      };
      try {
        // Update ticket's inline history array
        await updateDoc(doc(db, 'projects', task.ticketProjectId, 'tickets', task.ticketId), {
          history: arrayUnion(historyEntry),
        });
        // Task 6: also write to top-level history collection keyed by ticketId
        await addDoc(collection(db, 'history', task.ticketId, 'logs'), {
          completedAt: historyEntry.completedAt,
          completedBy: historyEntry.memberName || uid,
          taskTitle: historyEntry.taskTitle,
          detail: historyEntry.detail,
          taskId,
          memberUid: uid,
        });
      } catch (e) {
        console.warn('Ticket history sync:', e.message);
      }
    }
  };

  const updateTask = async (uid, taskId, fields) => {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), fields);
  };

  return { memberTasks, toggleTask, updateTask };
}
