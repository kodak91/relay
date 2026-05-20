import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { listFolderFiles, getMimeExt, formatDriveSize } from '../lib/driveApi';

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
  const [syncing, setSyncing] = useState(false);

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

  // ── Drive 연동 ───────────────────────────────────────────────────────────
  const connectDrive = async (kbFolderId, { driveFolderId, driveFolderName }) => {
    await updateDoc(doc(db, 'projects', projectId, 'kbFolders', kbFolderId), {
      driveFolderId,
      driveFolderName,
      driveLastSync: null,
    });
  };

  const disconnectDrive = async (kbFolderId) => {
    await updateDoc(doc(db, 'projects', projectId, 'kbFolders', kbFolderId), {
      driveFolderId: null,
      driveFolderName: null,
      driveLastSync: null,
    });
    // Remove all Drive-sourced files for this folder
    const driveFiles = files.filter((f) => f.folderId === kbFolderId && f.source === 'drive');
    const batch = writeBatch(db);
    driveFiles.forEach((f) => batch.delete(doc(db, 'projects', projectId, 'kbFiles', f.id)));
    await batch.commit();
  };

  const syncFromDrive = async (kbFolderId, token) => {
    const folder = folders.find((f) => f.id === kbFolderId);
    if (!folder?.driveFolderId) throw new Error('연동된 Drive 폴더가 없습니다.');

    setSyncing(true);
    try {
      const driveItems = await listFolderFiles(token, folder.driveFolderId);
      const existingDriveFiles = files.filter((f) => f.folderId === kbFolderId && f.source === 'drive');
      const existingById = Object.fromEntries(existingDriveFiles.map((f) => [f.driveFileId, f]));
      const seenIds = new Set();

      for (const di of driveItems) {
        seenIds.add(di.id);
        const ext = getMimeExt(di.mimeType, di.name);
        const date = new Date(di.modifiedTime).toLocaleDateString('ko');
        const uploaderName = di.owners?.[0]?.displayName || '—';

        const existing = existingById[di.id];
        if (existing) {
          // Update only if modified
          if (existing.driveModifiedTime !== di.modifiedTime) {
            await updateDoc(doc(db, 'projects', projectId, 'kbFiles', existing.id), {
              name: di.name, size: formatDriveSize(di.size),
              date, driveModifiedTime: di.modifiedTime,
              webViewLink: di.webViewLink, thumbnailLink: di.thumbnailLink || null,
              versions: [...(existing.versions || []), {
                v: (existing.v || 1) + 1, date, by: uploaderName, note: 'Drive 업데이트',
              }],
              v: (existing.v || 1) + 1,
            });
          }
        } else {
          // New file
          await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
            name: di.name, ext, folderId: kbFolderId,
            source: 'drive',
            driveFileId: di.id,
            driveModifiedTime: di.modifiedTime,
            webViewLink: di.webViewLink,
            thumbnailLink: di.thumbnailLink || null,
            uploader: uploaderName, uploaderUid: null,
            size: formatDriveSize(di.size), date,
            tags: [], v: 1,
            versions: [{ v: 1, date, by: uploaderName, note: 'Drive에서 색인됨' }],
            createdAt: serverTimestamp(),
          });
        }
      }

      // Remove files that were deleted from Drive
      const toRemove = existingDriveFiles.filter((f) => !seenIds.has(f.driveFileId));
      const batch = writeBatch(db);
      toRemove.forEach((f) => batch.delete(doc(db, 'projects', projectId, 'kbFiles', f.id)));
      await batch.commit();

      // Update last sync time
      await updateDoc(doc(db, 'projects', projectId, 'kbFolders', kbFolderId), {
        driveLastSync: new Date().toISOString(),
      });
    } finally {
      setSyncing(false);
    }
  };

  // ── Firebase 파일 업로드 ──────────────────────────────────────────────────
  const saveFromChat = async ({ name, ext, fileUrl, size, uploader, uploaderUid, folderId }) => {
    const existing = files.find((f) => f.folderId === folderId && f.name === name && f.source === 'firebase');
    const today = new Date().toLocaleDateString('ko');
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
      uploader, uploaderUid, tags: [], source: 'firebase', date: today, v: 1,
      versions: [{ v: 1, date: today, by: uploader, note: '채팅에서 저장' }],
      createdAt: serverTimestamp(),
    });
  };

  const addFileDirectly = async ({ name, ext, fileUrl, size, uploader, uploaderUid, folderId }) => {
    const today = new Date().toLocaleDateString('ko');
    const existing = files.find((f) => f.folderId === folderId && f.name === name && f.source === 'firebase');
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
      uploader, uploaderUid, tags: [], source: 'firebase', date: today, v: 1,
      versions: [{ v: 1, date: today, by: uploader, note: '직접 업로드' }],
      createdAt: serverTimestamp(),
    });
  };

  const deleteFile = async (fileId) => {
    await deleteDoc(doc(db, 'projects', projectId, 'kbFiles', fileId));
  };

  const updateFolder = async (id, fields) => {
    await updateDoc(doc(db, 'projects', projectId, 'kbFolders', id), fields);
  };

  const addFolder = async (name, icon, color) => {
    await addDoc(collection(db, 'projects', projectId, 'kbFolders'), {
      name, icon: icon || '📁', color: color || 'oklch(0.50 0.05 80)',
      order: folders.length,
    });
  };

  return {
    folders, files, loading, syncing,
    initFolders, updateFolder, addFolder,
    connectDrive, disconnectDrive, syncFromDrive,
    saveFromChat, addFileDirectly, deleteFile,
  };
}
