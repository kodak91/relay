import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const storageKey = (uid) => `relay_lastread_${uid || 'anon'}`;

function loadLastRead(uid) {
  try { return JSON.parse(localStorage.getItem(storageKey(uid)) || '{}'); }
  catch { return {}; }
}

export function useUnreadCounts(projects, uid) {
  const [allMessages, setAllMessages] = useState({});
  const [lastRead, setLastRead] = useState(() => loadLastRead(uid));

  const projectKey = (projects || []).map((p) => p.id).join(',');

  useEffect(() => {
    if (!projects?.length) { setAllMessages({}); return; }
    const map = {};
    const unsubscribers = projects.map((p) => {
      const q = query(collection(db, 'projects', p.id, 'messages'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        map[p.id] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllMessages({ ...map });
      });
    });
    return () => unsubscribers.forEach((u) => u());
  }, [projectKey]);

  const counts = useMemo(() => {
    const result = {};
    for (const [pid, msgs] of Object.entries(allMessages)) {
      const lr = lastRead[pid] ? new Date(lastRead[pid]).getTime() : 0;
      result[pid] = (msgs || []).filter((m) => {
        const t = m.createdAt?.toDate?.()?.getTime() || 0;
        return t > lr && m.senderUid !== uid;
      }).length;
    }
    return result;
  }, [allMessages, lastRead, uid]);

  const markRead = (projectId) => {
    const updated = { ...lastRead, [projectId]: new Date().toISOString() };
    setLastRead(updated);
    try { localStorage.setItem(storageKey(uid), JSON.stringify(updated)); } catch {}
  };

  return { counts, markRead };
}
