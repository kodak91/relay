import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, updateDoc, doc, arrayUnion, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const PROJECT_TASK_UID = '__project__';

export function formatTaskDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function taskDate(t) {
  if (t.date) return t.date;
  if (t.dueDate) return t.dueDate;
  if (t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due)) return t.due;
  const ts = t.createdAt?.toDate?.();
  return ts ? formatTaskDate(ts) : formatTaskDate();
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

export function useTeamTasks(members, projectId) {
  const [memberTasks, setMemberTasks] = useState({});
  const memberKey = (members || []).map((m) => m.uid).filter(Boolean).join(',');
  const memberUidSet = useMemo(() => new Set((members || []).map((m) => m.uid).filter(Boolean)), [memberKey]); // eslint-disable-line

  useEffect(() => {
    if (!memberKey && !projectId) { setMemberTasks({}); return; }
    const personalByUid = {};
    let projectTasks = [];

    const publish = () => {
      const next = {};
      (members || []).filter((m) => m.uid).forEach((m) => {
        next[m.uid] = [...(personalByUid[m.uid] || [])];
      });

      projectTasks.forEach((task) => {
        const assigneeUid = task.assigneeUid || task.ownerUid || task.uid;
        if (assigneeUid && memberUidSet.has(assigneeUid)) {
          next[assigneeUid] = [...(next[assigneeUid] || []), task];
        }
      });

      Object.keys(next).forEach((uid) => {
        next[uid] = sortTasks(next[uid]);
      });
      setMemberTasks(next);
    };

    const unsubs = (members || []).filter((m) => m.uid).map((m) => {
      return onSnapshot(collection(db, 'users', m.uid, 'tasks'), (snap) => {
        personalByUid[m.uid] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _source: 'personal',
          _ownerUid: m.uid,
        }));
        publish();
      });
    });
    if (projectId) {
      unsubs.push(onSnapshot(collection(db, 'projects', projectId, 'tasks'), (snap) => {
        projectTasks = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _source: 'project',
          _projectId: projectId,
        }));
        publish();
      }));
    }
    return () => unsubs.forEach((u) => u());
  }, [memberKey, projectId]); // eslint-disable-line

  const findTask = (uid, taskId) =>
    (memberTasks[uid] || []).find((t) => t.id === taskId)
    || Object.values(memberTasks).flat().find((t) => t.id === taskId);

  const toggleTask = async (uid, taskId, done, task) => {
    const target = task || findTask(uid, taskId);
    if (target?._source === 'project') {
      await updateDoc(doc(db, 'projects', target._projectId || projectId, 'tasks', taskId), { done });
    } else {
      await updateDoc(doc(db, 'users', uid, 'tasks', taskId), { done });
    }
    if (done && target?.ticketId && target?.ticketProjectId) {
      const historyEntry = {
        type: 'task_completed',
        taskId,
        taskTitle: target.title || '',
        detail: target.detail || '',
        memberUid: target.assigneeUid || uid,
        memberName: target.memberName || target.assigneeName || '',
        completedAt: new Date().toISOString(),
      };
      try {
        // Update ticket's inline history array
        await updateDoc(doc(db, 'projects', target.ticketProjectId, 'tickets', target.ticketId), {
          history: arrayUnion(historyEntry),
        });
        // Task 6: also write to top-level history collection keyed by ticketId
        await addDoc(collection(db, 'history', target.ticketId, 'logs'), {
          completedAt: historyEntry.completedAt,
          completedBy: historyEntry.memberName || historyEntry.memberUid,
          taskTitle: historyEntry.taskTitle,
          detail: historyEntry.detail,
          taskId,
          memberUid: historyEntry.memberUid,
        });
      } catch (e) {
        console.warn('Ticket history sync:', e.message);
      }
    }
  };

  const updateTask = async (uid, taskId, fields, task) => {
    const target = task || findTask(uid, taskId);
    if (target?._source === 'project') {
      await updateDoc(doc(db, 'projects', target._projectId || projectId, 'tasks', taskId), fields);
      return;
    }
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), fields);
  };

  const addTask = async ({ title, assigneeUid, assigneeName, date, detail, assignedBy }) => {
    const cleanTitle = title?.trim();
    if (!cleanTitle) return;
    const base = {
      title: cleanTitle,
      done: false,
      date: date || formatTaskDate(),
      detail: detail || '',
      createdAt: serverTimestamp(),
    };

    if (assigneeUid && assigneeUid !== PROJECT_TASK_UID) {
      await addDoc(collection(db, 'users', assigneeUid, 'tasks'), {
        ...base,
        projectId: projectId || null,
        assigneeUid,
        assigneeName: assigneeName || '',
        assignedBy: assignedBy || '',
        assignedFrom: 'tasks-tab',
      });
      return;
    }

    if (!projectId) return;
    await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      ...base,
      assigneeUid: null,
      assigneeName: null,
      from: 'tasks-tab',
    });
  };

  return { memberTasks, toggleTask, updateTask, addTask };
}
