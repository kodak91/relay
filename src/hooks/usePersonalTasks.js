import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp,
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
    // Manual drag order (if set) wins over date/creation ordering, so a
    // user's custom sequence survives re-renders and Firestore refreshes.
    const ao = a.order;
    const bo = b.order;
    if (ao != null || bo != null) {
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      if (ao != null && bo == null) return -1;
      if (ao == null && bo != null) return 1;
    }
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
    // 완료 시 완료일 기록(완료한 날 기준 배치), 해제 시 제거
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), { done, completedDate: done ? formatTaskDate() : null });
    if (task?.ticketId && task?.ticketProjectId) {
      const ticketRef = doc(db, 'projects', task.ticketProjectId, 'tickets', task.ticketId);
      try {
        const ticketSnap = await getDoc(ticketRef);
        if (ticketSnap.exists()) {
          const currentHistory = ticketSnap.data().history || [];
          const filtered = currentHistory.filter((h) => h.taskId !== taskId);
          if (done) {
            filtered.push({
              type: 'task_completed',
              taskId,
              taskTitle: task.title || '',
              memberUid: uid,
              completedAt: new Date().toISOString(),
            });
          }
          await updateDoc(ticketRef, { history: filtered });
        }
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

  // Persist a manually dragged order for a set of task ids (e.g. one visible
  // group in the sidebar). Only touches ids that actually moved.
  const reorderTasks = async (orderedIds) => {
    if (!uid) return;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    await Promise.all(
      orderedIds.map((id, i) => {
        const t = byId.get(id);
        if (!t || t.order === i) return null;
        return updateDoc(doc(db, 'users', uid, 'tasks', id), { order: i });
      })
    );
  };

  return { tasks, todayTasks, overdueTasks, weekStats, error, addTask, toggleTask, updateTask, deleteTask, deleteAllTasks, reorderTasks };
}
