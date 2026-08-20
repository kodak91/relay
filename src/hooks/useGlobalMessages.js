import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const SPECIAL_TYPES = ['approval', 'decision', 'vote', 'update', 'announce', 'meeting'];

// Subscribes to special-type messages across ALL projects
export function useGlobalMessages(projects) {
  const [allMessages, setAllMessages] = useState([]);
  // projectId -> Map<msgId, message>, reused across snapshots so messages
  // that didn't change keep a stable reference (see useMessages.js for why).
  const msgMapsRef = useRef({});
  const orderedRef = useRef({});

  const projectKey = (projects || []).map((p) => p.id).join(',');

  useEffect(() => {
    if (!projects?.length) { setAllMessages([]); return; }

    msgMapsRef.current = {};
    orderedRef.current = {};
    const unsubscribers = projects.map((p) => {
      const map = new Map();
      msgMapsRef.current[p.id] = map;
      const q = query(collection(db, 'projects', p.id, 'messages'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'removed') map.delete(change.doc.id);
          else map.set(change.doc.id, { id: change.doc.id, projectId: p.id, projectName: p.name, ...change.doc.data() });
        });
        orderedRef.current[p.id] = snap.docs
          .map((d) => map.get(d.id))
          .filter((m) => m && SPECIAL_TYPES.includes(m.type));
        setAllMessages(Object.values(orderedRef.current).flat());
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [projectKey]);

  return { messages: allMessages };
}
