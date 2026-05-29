import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
  where, arrayUnion, getDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const genInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export function useProjects(userId) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    if (userId) {
      q = query(collection(db, 'projects'), where('memberUids', 'array-contains', userId));
    } else {
      q = query(collection(db, 'projects'), orderBy('createdAt', 'asc'));
    }
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (userId) {
        docs.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return at - bt;
        });
      }
      setProjects(docs);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  const addProject = async (name, color, leadName, creatorUid) => {
    const pf = name[0].toUpperCase();
    const inviteCode = genInviteCode();
    const firstMember = creatorUid
      ? [{ uid: creatorUid, name: leadName || '', role: 'lead', joinedAt: new Date().toISOString() }]
      : [];
    await addDoc(collection(db, 'projects'), {
      name,
      color: color || 'oklch(0.50 0.20 270)',
      pf,
      status: '진행중',
      leadName: leadName || '',
      inviteCode,
      ownerId: creatorUid || null,
      members: firstMember,
      memberUids: creatorUid ? [creatorUid] : [],
      pendingMembers: [],
      createdAt: serverTimestamp(),
    });
  };

  const updateProject = async (id, fields) => {
    await updateDoc(doc(db, 'projects', id), fields);
  };

  const deleteProject = async (id) => {
    // Soft-delete: mark as deleted and disconnect integrations.
    // Drive files/folders live in Google Drive and subcollections — they are not touched.
    await updateDoc(doc(db, 'projects', id), {
      status: '삭제됨',
      deletedAt: serverTimestamp(),
      slackWebhook: null,
    });
  };

  const joinByCode = async (code, user) => {
    const q2 = query(collection(db, 'projects'), where('inviteCode', '==', code.trim().toUpperCase()));
    const snap = await getDocs(q2);
    if (snap.empty) throw new Error('유효하지 않은 초대 코드입니다.');
    const projDoc = snap.docs[0];
    const data = projDoc.data();
    if ((data.memberUids || []).includes(user.uid)) throw new Error('이미 멤버입니다.');
    if ((data.pendingMembers || []).some((m) => m.uid === user.uid)) throw new Error('이미 승인 대기 중입니다.');
    await updateDoc(doc(db, 'projects', projDoc.id), {
      pendingMembers: arrayUnion({
        uid: user.uid,
        name: user.name || user.email || '',
        requestedAt: new Date().toISOString(),
      }),
    });
    return data.name;
  };

  const approveMember = async (projectId, pendingUid) => {
    const ref = doc(db, 'projects', projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const pending = (data.pendingMembers || []).find((m) => m.uid === pendingUid);
    if (!pending) return;
    await updateDoc(ref, {
      pendingMembers: (data.pendingMembers || []).filter((m) => m.uid !== pendingUid),
      members: arrayUnion({ uid: pending.uid, name: pending.name, role: 'member', joinedAt: new Date().toISOString() }),
      memberUids: arrayUnion(pendingUid),
    });
  };

  const rejectMember = async (projectId, pendingUid) => {
    const ref = doc(db, 'projects', projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    await updateDoc(ref, {
      pendingMembers: (data.pendingMembers || []).filter((m) => m.uid !== pendingUid),
    });
  };

  const removeMember = async (projectId, memberUid) => {
    const ref = doc(db, 'projects', projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    await updateDoc(ref, {
      members: (data.members || []).filter((m) => m.uid !== memberUid),
      memberUids: (data.memberUids || []).filter((uid) => uid !== memberUid),
    });
  };

  const delegateLead = async (projectId, newLeadUid) => {
    const ref = doc(db, 'projects', projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const newLeadMember = (data.members || []).find((m) => m.uid === newLeadUid);
    if (!newLeadMember) return;
    const updatedMembers = (data.members || []).map((m) => ({
      ...m,
      role: m.uid === newLeadUid ? 'lead' : 'member',
    }));
    await updateDoc(ref, {
      members: updatedMembers,
      ownerId: newLeadUid,
      leadName: newLeadMember.name || '',
    });
  };

  return {
    projects, loading,
    addProject, updateProject, deleteProject,
    joinByCode, approveMember, rejectMember, removeMember, delegateLead,
  };
}
