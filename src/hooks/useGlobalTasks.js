import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Subscribes to tasks across ALL projects
export function useGlobalTasks(projects) {
  const [allTasks, setAllTasks] = useState([]);
  const taskMapRef = useRef({});

  const projectKey = (projects || []).map((p) => p.id).join(',');

  useEffect(() => {
    if (!projects?.length) { setAllTasks([]); return; }

    taskMapRef.current = {};
    const unsubscribers = projects.map((p) => {
      const q = query(collection(db, 'projects', p.id, 'tasks'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        taskMapRef.current[p.id] = snap.docs.map((d) => ({
          id: d.id,
          projectId: p.id,
          projectName: p.name,
          ...d.data(),
        }));
        setAllTasks(Object.values(taskMapRef.current).flat());
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [projectKey]);

  const addTask = async (projectId, taskData) => {
    if (!projectId) return;
    await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      ...taskData,
      done: false,
      createdAt: serverTimestamp(),
    });
  };

  const toggleTask = async (projectId, taskId, done) => {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), { done });
  };

  return { tasks: allTasks, addTask, toggleTask };
}
