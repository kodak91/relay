import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const SPECIAL_TYPES = ['approval', 'decision', 'vote', 'update', 'announce', 'meeting'];

// Subscribes to special-type messages across ALL projects
export function useGlobalMessages(projects) {
  const [allMessages, setAllMessages] = useState([]);
  const msgMapRef = useRef({});

  const projectKey = (projects || []).map((p) => p.id).join(',');

  useEffect(() => {
    if (!projects?.length) { setAllMessages([]); return; }

    msgMapRef.current = {};
    const unsubscribers = projects.map((p) => {
      const q = query(collection(db, 'projects', p.id, 'messages'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        msgMapRef.current[p.id] = snap.docs
          .map((d) => ({ id: d.id, projectId: p.id, projectName: p.name, ...d.data() }))
          .filter((m) => SPECIAL_TYPES.includes(m.type));
        setAllMessages(Object.values(msgMapRef.current).flat());
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [projectKey]);

  return { messages: allMessages };
}
