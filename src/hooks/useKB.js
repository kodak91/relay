import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const DEFAULT_FOLDERS = [
  { name: '디자인 에셋', icon: '🎨', color: 'oklch(0.55 0.18 50)', order: 0 },
  { name: '카피·문구',   icon: '✏️', color: 'oklch(0.50 0.15 240)', order: 1 },
  { name: '계약·발주',   icon: '📋', color: 'oklch(0.50 0.15 150)', order: 2 },
  { name: '레퍼런스',    icon: '🔖', color: 'oklch(0.50 0.18 280)', order: 3 },
];

export function useKB(projectId) {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let foldersReady = false;
    let filesReady = false;
    const done = () => { if (foldersReady && filesReady) setLoading(false); };

    const unsubF = onSnapshot(
      query(collection(db, 'projects', projectId, 'kbFolders'), orderBy('order', 'asc')),
      (snap) => { setFolders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); foldersReady = true; done(); }
    );
    const unsubI = onSnapshot(
      query(collection(db, 'projects', projectId, 'kbFiles'), orderBy('createdAt', 'desc')),
      (snap) => { setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); filesReady = true; done(); }
    );
    return () => { unsubF(); unsubI(); };
  }, [projectId]);

  const initFolders = async () => {
    if (folders.length > 0) return;
    for (const f of DEFAULT_FOLDERS) {
      await addDoc(collection(db, 'projects', projectId, 'kbFolders'), f);
    }
  };

  const saveFromChat = async ({ name, ext, fileUrl, size, uploader, uploaderUid, folderId }) => {
    const existing = files.find((f) => f.folderId === folderId && f.name === name);
    if (existing) {
      const newV = (existing.v || 1) + 1;
      const today = new Date().toLocaleDateString('ko');
      await updateDoc(doc(db, 'projects', projectId, 'kbFiles', existing.id), {
        v: newV,
        fileUrl,
        size,
        date: today,
        versions: [...(existing.versions || []), { v: newV, date: today, by: uploader, note: '업데이트' }],
      });
      return;
    }
    const today = new Date().toLocaleDateString('ko');
    await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
      name, ext, fileUrl, size, folderId,
      uploader, uploaderUid,
      tags: [],
      source: 'firebase',
      date: today,
      v: 1,
      versions: [{ v: 1, date: today, by: uploader, note: '채팅에서 저장' }],
      createdAt: serverTimestamp(),
    });
  };

  const addFileDirectly = async ({ name, ext, fileUrl, size, uploader, uploaderUid, folderId }) => {
    const today = new Date().toLocaleDateString('ko');
    const existing = files.find((f) => f.folderId === folderId && f.name === name);
    if (existing) {
      const newV = (existing.v || 1) + 1;
      await updateDoc(doc(db, 'projects', projectId, 'kbFiles', existing.id), {
        v: newV, fileUrl, size, date: today,
        versions: [...(existing.versions || []), { v: newV, date: today, by: uploader, note: '업데이트' }],
      });
      return;
    }
    await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
      name, ext, fileUrl, size, folderId,
      uploader, uploaderUid, tags: [], source: 'firebase', date: today,
      v: 1, versions: [{ v: 1, date: today, by: uploader, note: '직접 업로드' }],
      createdAt: serverTimestamp(),
    });
  };

  const deleteFile = async (fileId) => {
    await deleteDoc(doc(db, 'projects', projectId, 'kbFiles', fileId));
  };

  const addFolder = async (name, icon, color) => {
    await addDoc(collection(db, 'projects', projectId, 'kbFolders'), {
      name, icon: icon || '📁', color: color || 'oklch(0.50 0.05 80)',
      order: folders.length,
    });
  };

  return { folders, files, loading, initFolders, saveFromChat, addFileDirectly, deleteFile, addFolder };
}
