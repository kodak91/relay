import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useMessages(projectId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setMessages([]); setLoading(false); return; }
    const q = query(
      collection(db, 'projects', projectId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  const sendMessage = async (projectId, msgData) => {
    await addDoc(collection(db, 'projects', projectId, 'messages'), {
      ...msgData,
      createdAt: serverTimestamp(),
      thread: [],
      reactions: [],
    });
  };

  const addReply = async (projectId, messageId, reply) => {
    await updateDoc(doc(db, 'projects', projectId, 'messages', messageId), {
      thread: arrayUnion({ ...reply, ts: new Date().toISOString() }),
      threadHasNew: true,
    });
  };

  const updateMessageField = async (projectId, messageId, fields) => {
    await updateDoc(doc(db, 'projects', projectId, 'messages', messageId), fields);
  };

  return { messages, loading, sendMessage, addReply, updateMessageField };
}
