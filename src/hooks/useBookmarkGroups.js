import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useBookmarkGroups(projectId) {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, 'projects', projectId, 'bookmarkGroups'), orderBy('createdAt'));
    return onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [projectId]);

  const addGroup = (name) =>
    addDoc(collection(db, 'projects', projectId, 'bookmarkGroups'), {
      name, createdAt: serverTimestamp(),
    });

  const deleteGroup = (groupId) =>
    deleteDoc(doc(db, 'projects', projectId, 'bookmarkGroups', groupId));

  return { groups, addGroup, deleteGroup };
}

export function useBookmarkItems(projectId, groupId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!projectId || !groupId) return;
    const q = query(
      collection(db, 'projects', projectId, 'bookmarkGroups', groupId, 'items'),
      orderBy('createdAt')
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [projectId, groupId]);

  const addItem = (url, name, description = '') =>
    addDoc(collection(db, 'projects', projectId, 'bookmarkGroups', groupId, 'items'), {
      url, name: name || url, description, createdAt: serverTimestamp(),
    });

  const deleteItem = (itemId) =>
    deleteDoc(doc(db, 'projects', projectId, 'bookmarkGroups', groupId, 'items', itemId));

  return { items, addItem, deleteItem };
}
