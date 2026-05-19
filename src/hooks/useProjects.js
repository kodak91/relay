import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const addProject = async (name, color) => {
    const pf = name[0].toUpperCase();
    await addDoc(collection(db, 'projects'), {
      name, color: color || 'oklch(0.50 0.20 270)',
      pf, status: '진행중',
      createdAt: serverTimestamp(),
    });
  };

  const updateProject = async (id, fields) => {
    await updateDoc(doc(db, 'projects', id), fields);
  };

  const deleteProject = async (id) => {
    await deleteDoc(doc(db, 'projects', id));
  };

  return { projects, loading, addProject, updateProject, deleteProject };
}
