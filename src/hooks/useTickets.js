import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useTickets(projectId) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setTickets([]); setLoading(false); return; }
    const q = query(collection(db, 'projects', projectId, 'tickets'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  const createTicket = async (data) => {
    if (!projectId) return null;
    return await addDoc(collection(db, 'projects', projectId, 'tickets'), {
      ...data,
      createdAt: serverTimestamp(),
    });
  };

  const updateTicket = async (ticketDocId, fields) => {
    if (!projectId || !ticketDocId) return;
    await updateDoc(doc(db, 'projects', projectId, 'tickets', ticketDocId), fields);
  };

  return { tickets, loading, createTicket, updateTicket };
}
