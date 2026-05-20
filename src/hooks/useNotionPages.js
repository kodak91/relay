import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useNotionPages(projectId) {
  const [pages, setPages] = useState([]);

  useEffect(() => {
    if (!projectId) { setPages([]); return; }
    const q = query(
      collection(db, 'projects', projectId, 'notionPages'),
      orderBy('addedAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setPages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [projectId]);

  const addPage = async (url, name) => {
    if (!projectId || !url.trim()) return;
    await addDoc(collection(db, 'projects', projectId, 'notionPages'), {
      url: url.trim(),
      name: (name || '').trim() || url.trim(),
      addedAt: serverTimestamp(),
    });
  };

  const deletePage = async (id) => {
    await deleteDoc(doc(db, 'projects', projectId, 'notionPages', id));
  };

  return { pages, addPage, deletePage };
}
