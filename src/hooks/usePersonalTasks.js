import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function formatTaskDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr() {
  return formatTaskDate();
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
    return formatTaskDate(d);
  });
}

export function taskDate(t) {
  if (t.date) return t.date;
  if (t.dueDate) return t.dueDate;
  if (t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due)) return t.due;
  const ts = t.createdAt?.toDate?.();
  return ts ? formatTaskDate(ts) : todayStr();
}

function sortTasks(items) {
  return [...items].sort((a, b) => {
    const ad = taskDate(a);
    const bd = taskDate(b);
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    return at - bt;
  });
}

export function usePersonalTasks(uid) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) { setTasks([]); setError(''); return; }
    return onSnapshot(collection(db, 'users', uid, 'tasks'), (snap) => {
      setError('');
      setTasks(sortTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    }, (e) => {
      setTasks([]);
      setError(e?.message || '태스크를 불러오지 못했습니다.');
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

  const updateTask = async (taskId, fields) => {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), fields);
  };

  const deleteTask = async (taskId) => {
    await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
  };

  const deleteAllTasks = async () => {
    if (!uid) return;
    await Promise.all(tasks.map((t) => deleteDoc(doc(db, 'users', uid, 'tasks', t.id))));
  };

  return { tasks, todayTasks, overdueTasks, weekStats, error, addTask, toggleTask, updateTask, deleteTask, deleteAllTasks };
}
