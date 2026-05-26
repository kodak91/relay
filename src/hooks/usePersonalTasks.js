import { useState, useEffect, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Returns Mon-Sun dates for the current calendar week
export function getWeekDates() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function taskDate(t) {
  if (t.date) return t.date;
  const ts = t.createdAt?.toDate?.();
  return ts ? ts.toISOString().slice(0, 10) : todayStr();
}

export function usePersonalTasks(uid) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!uid) { setTasks([]); return; }
    const q = query(
      collection(db, 'users', uid, 'tasks'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  const today = todayStr();

  const todayTasks = useMemo(
    () => tasks.filter((t) => taskDate(t) === today),
    [tasks, today]
  );

  const overdueTasks = useMemo(
    () => tasks.filter((t) => taskDate(t) < today && !t.done),
    [tasks, today]
  );

  const weekStats = useMemo(() => {
    const weekDates = getWeekDates();
    return weekDates.map((d) => {
      const dayTasks = tasks.filter((t) => taskDate(t) === d);
      return {
        date: d,
        done: dayTasks.filter((t) => t.done).length,
        total: dayTasks.length,
      };
    });
  }, [tasks]);

  const addTask = async (title, date) => {
    if (!uid || !title.trim()) return;
    await addDoc(collection(db, 'users', uid, 'tasks'), {
      title: title.trim(),
      done: false,
      date: date || todayStr(),
      createdAt: serverTimestamp(),
    });
  };

  const toggleTask = async (taskId, done) => {
    const task = tasks.find((t) => t.id === taskId);
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), { done });
    if (done && task?.ticketId && task?.ticketProjectId) {
      try {
        await updateDoc(doc(db, 'projects', task.ticketProjectId, 'tickets', task.ticketId), {
          history: arrayUnion({
            type: 'task_completed',
            taskId,
            taskTitle: task.title || '',
            memberUid: uid,
            completedAt: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.warn('Ticket history sync:', e.message);
      }
    }
  };

  const deleteTask = async (taskId) => {
    await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
  };

  const deleteAllTasks = async () => {
    if (!uid) return;
    await Promise.all(tasks.map((t) => deleteDoc(doc(db, 'users', uid, 'tasks', t.id))));
  };

  return { tasks, todayTasks, overdueTasks, weekStats, addTask, toggleTask, deleteTask, deleteAllTasks };
}
