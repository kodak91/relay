import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  buildFolderTree, listFolderFiles, getMimeExt, formatDriveSize, uploadFileToDrive,
} from '../lib/driveApi';

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

  // ── Drive root connection ─────────────────────────────────────────────────
  // Reads the full Drive folder tree, creates kbFolder entries, and immediately
  // indexes files in each folder — all in one pass to avoid Firestore listener timing issues.
  const connectDriveRoot = async (token, { driveFolderId }) => {
    setSyncing(true);
    try {
      // Clear existing kbFolders and drive-sourced files
      if (folders.length > 0) {
        const cleanBatch = writeBatch(db);
        folders.forEach((f) => cleanBatch.delete(doc(db, 'projects', projectId, 'kbFolders', f.id)));
        files.filter((f) => f.source === 'drive').forEach((f) =>
          cleanBatch.delete(doc(db, 'projects', projectId, 'kbFiles', f.id))
        );
        await cleanBatch.commit();
      }

      const tree = await buildFolderTree(token, driveFolderId);
      const col = collection(db, 'projects', projectId, 'kbFolders');

      // Create kbFolder entries and keep track of firestoreId per drive folder id
      const folderIdMap = {}; // driveFolderId → firestore doc id
      for (let i = 0; i < tree.length; i++) {
        const node = tree[i];
        const ref = await addDoc(col, {
          name: node.name,
          driveFolderId: node.id,
          parentDriveFolderId: node.parentId,
          drivePath: node.path,
          depth: node.depth,
          isRoot: node.depth === 0,
          order: i,
          driveLastSync: null,
        });
        folderIdMap[node.id] = ref.id;
      }

      // Index files for each folder immediately (no need to wait for Firestore listener)
      for (const node of tree) {
        const kbFolderId = folderIdMap[node.id];
        try {
          const driveItems = await listFolderFiles(token, node.id);
          for (const di of driveItems) {
            const ext = getMimeExt(di.mimeType, di.name);
            const date = new Date(di.modifiedTime).toLocaleDateString('ko');
            const uploaderName = di.owners?.[0]?.displayName || '—';
            await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
              name: di.name, ext, folderId: kbFolderId,
              source: 'drive', driveFileId: di.id,
              driveModifiedTime: di.modifiedTime,
              webViewLink: di.webViewLink, thumbnailLink: di.thumbnailLink || null,
              uploader: uploaderName, uploaderUid: null,
              size: formatDriveSize(di.size), date,
              tags: [], v: 1,
              versions: [{ v: 1, date, by: uploaderName, note: 'Drive에서 색인됨' }],
              createdAt: serverTimestamp(),
            });
          }
          await updateDoc(doc(db, 'projects', projectId, 'kbFolders', kbFolderId), {
            driveLastSync: new Date().toISOString(),
          });
        } catch (e) {
          console.warn(`Folder ${node.name} file sync failed:`, e.message);
        }
      }
    } finally {
      setSyncing(false);
    }
  };

  const disconnectDrive = async () => {
    const batch = writeBatch(db);
    folders.forEach((f) => batch.delete(doc(db, 'projects', projectId, 'kbFolders', f.id)));
    files.filter((f) => f.source === 'drive').forEach((f) =>
      batch.delete(doc(db, 'projects', projectId, 'kbFiles', f.id))
    );
    await batch.commit();
  };

  // Syncs files for every Drive-connected kbFolder
  const syncFromDrive = async (token) => {
    const driveFolders = folders.filter((f) => f.driveFolderId);
    if (driveFolders.length === 0) throw new Error('연동된 Drive 폴더가 없습니다.');

    setSyncing(true);
    try {
      for (const folder of driveFolders) {
        const driveItems = await listFolderFiles(token, folder.driveFolderId);
        const existingDriveFiles = files.filter((f) => f.folderId === folder.id && f.source === 'drive');
        const existingById = Object.fromEntries(existingDriveFiles.map((f) => [f.driveFileId, f]));
        const seenIds = new Set();

        for (const di of driveItems) {
          seenIds.add(di.id);
          const ext = getMimeExt(di.mimeType, di.name);
          const date = new Date(di.modifiedTime).toLocaleDateString('ko');
          const uploaderName = di.owners?.[0]?.displayName || '—';

          const existing = existingById[di.id];
          if (existing) {
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
            await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
              name: di.name, ext, folderId: folder.id,
              source: 'drive', driveFileId: di.id,
              driveModifiedTime: di.modifiedTime,
              webViewLink: di.webViewLink, thumbnailLink: di.thumbnailLink || null,
              uploader: uploaderName, uploaderUid: null,
              size: formatDriveSize(di.size), date,
              tags: [], v: 1,
              versions: [{ v: 1, date, by: uploaderName, note: 'Drive에서 색인됨' }],
              createdAt: serverTimestamp(),
            });
          }
        }

        const toRemove = existingDriveFiles.filter((f) => !seenIds.has(f.driveFileId));
        if (toRemove.length > 0) {
          const batch = writeBatch(db);
          toRemove.forEach((f) => batch.delete(doc(db, 'projects', projectId, 'kbFiles', f.id)));
          await batch.commit();
        }

        await updateDoc(doc(db, 'projects', projectId, 'kbFolders', folder.id), {
          driveLastSync: new Date().toISOString(),
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  // ── Drive upload ───────────────────────────────────────────────────────────
  const uploadToDrive = async (kbFolderId, selectedFiles, token) => {
    const folder = folders.find((f) => f.id === kbFolderId);
    if (!folder?.driveFolderId) throw new Error('Drive 폴더가 연동되지 않았습니다.');
    const today = new Date().toLocaleDateString('ko');

    for (const file of selectedFiles) {
      const driveFile = await uploadFileToDrive(token, folder.driveFolderId, file);
      const ext = getMimeExt(driveFile.mimeType, driveFile.name);
      const uploaderName = driveFile.owners?.[0]?.displayName || '—';
      await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
        name: driveFile.name, ext, folderId: kbFolderId,
        source: 'drive', driveFileId: driveFile.id,
        driveModifiedTime: driveFile.modifiedTime,
        webViewLink: driveFile.webViewLink, thumbnailLink: driveFile.thumbnailLink || null,
        uploader: uploaderName, uploaderUid: null,
        size: formatDriveSize(driveFile.size), date: today,
        tags: [], v: 1,
        versions: [{ v: 1, date: today, by: uploaderName, note: 'Relay에서 업로드' }],
        createdAt: serverTimestamp(),
      });
    }
  };

  // ── Chat save ─────────────────────────────────────────────────────────────
  // If the target folder is Drive-connected and a blob + token are provided,
  // uploads to Drive. Otherwise falls back to indexing the Firebase Storage URL.
  const saveFromChat = async ({ name, ext, fileUrl, size, blob, token, uploader, uploaderUid, folderId }) => {
    const folder = folders.find((f) => f.id === folderId);
    const today = new Date().toLocaleDateString('ko');

    if (folder?.driveFolderId && blob && token) {
      const driveFile = await uploadFileToDrive(token, folder.driveFolderId, blob);
      const driveExt = getMimeExt(driveFile.mimeType, driveFile.name);
      const existing = files.find(
        (f) => f.folderId === folderId && f.driveFileId === driveFile.id && f.source === 'drive'
      );
      if (existing) {
        const newV = (existing.v || 1) + 1;
        await updateDoc(doc(db, 'projects', projectId, 'kbFiles', existing.id), {
          v: newV, size: formatDriveSize(driveFile.size), date: today,
          webViewLink: driveFile.webViewLink,
          versions: [...(existing.versions || []), { v: newV, date: today, by: uploader, note: '채팅에서 재업로드' }],
        });
        return;
      }
      await addDoc(collection(db, 'projects', projectId, 'kbFiles'), {
        name: driveFile.name, ext: driveExt, folderId,
        source: 'drive', driveFileId: driveFile.id,
        driveModifiedTime: driveFile.modifiedTime,
        webViewLink: driveFile.webViewLink, thumbnailLink: driveFile.thumbnailLink || null,
        uploader, uploaderUid,
        size: formatDriveSize(driveFile.size), date: today,
        tags: [], v: 1,
        versions: [{ v: 1, date: today, by: uploader, note: '채팅에서 Drive로 업로드' }],
        createdAt: serverTimestamp(),
      });
      return;
    }

    // Fallback: index Firebase Storage URL
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
      versions: [{ v: 1, date: today, by: uploader, note: '채팅에서 저장' }],
      createdAt: serverTimestamp(),
    });
  };

  const deleteFile = async (fileId) => {
    await deleteDoc(doc(db, 'projects', projectId, 'kbFiles', fileId));
  };

  return {
    folders, files, loading, syncing,
    connectDriveRoot, disconnectDrive, syncFromDrive,
    uploadToDrive, saveFromChat, deleteFile,
  };
}
