import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useTasks(projectId) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setTasks([]); setLoading(false); return; }
    const q = query(
      collection(db, 'projects', projectId, 'tasks'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  const addTask = async (projectId, taskData) => {
    await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      ...taskData,
      done: false,
      createdAt: serverTimestamp(),
    });
  };

  const toggleTask = async (projectId, taskId, done) => {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), { done });
  };

  return { tasks, loading, addTask, toggleTask };
}
