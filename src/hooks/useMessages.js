import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, limitToLast, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Live chat view only needs the recent window — loading a workspace's entire
// history on every keystroke/reaction elsewhere is what caused the typing lag.
// "더 불러오기" grows the window by one page at a time instead.
const PAGE_SIZE = 150;

export function useMessages(projectId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  // id -> message object, reused across snapshots so unchanged messages keep
  // a stable reference and <Message memo> can actually skip re-rendering them
  // instead of re-rendering the whole history on every unrelated write.
  const msgMapRef = useRef(new Map());

  // Reset pagination when switching projects. setPageCount(1) is a no-op
  // (React bails out) when it's already 1, so this doesn't add an extra
  // subscribe/unsubscribe cycle in the common case.
  useEffect(() => { setPageCount(1); }, [projectId]);

  useEffect(() => {
    msgMapRef.current = new Map();
    if (!projectId) { setMessages([]); setLoading(false); setHasMore(false); return; }
    if (pageCount > 1) setLoadingMore(true);
    const limit = pageCount * PAGE_SIZE;
    const q = query(
      collection(db, 'projects', projectId, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(limit)
    );
    const unsub = onSnapshot(q, (snap) => {
      const map = msgMapRef.current;
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') map.delete(change.doc.id);
        else map.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
      });
      setMessages(snap.docs.map((d) => map.get(d.id)));
      setHasMore(snap.docs.length >= limit);
      setLoading(false);
      setLoadingMore(false);
    });
    return unsub;
  }, [projectId, pageCount]);

  // Grows the subscribed window by one page — pulls in older messages without
  // touching the live-window logic that keeps typing/reactions fast.
  const loadMore = useCallback(() => setPageCount((c) => c + 1), []);

  const sendMessage = async (projectId, msgData) => {
    const ref = await addDoc(collection(db, 'projects', projectId, 'messages'), {
      ...msgData,
      createdAt: serverTimestamp(),
      thread: [],
      reactions: [],
    });
    return ref;
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

  const confirmMessage = async (projectId, messageId, uid) => {
    await updateDoc(doc(db, 'projects', projectId, 'messages', messageId), {
      confirmedBy: arrayUnion(uid),
    });
  };

  const nudgeMessage = async (projectId, messageId) => {
    await updateDoc(doc(db, 'projects', projectId, 'messages', messageId), {
      nudgedAt: serverTimestamp(),
    });
  };

  const deleteMessage = async (projectId, messageId) => {
    await deleteDoc(doc(db, 'projects', projectId, 'messages', messageId));
  };

  const editMessage = async (projectId, messageId, newText) => {
    await updateDoc(doc(db, 'projects', projectId, 'messages', messageId), {
      text: newText,
      editedAt: new Date().toISOString(),
    });
  };

  return { messages, loading, loadingMore, hasMore, loadMore, sendMessage, addReply, updateMessageField, confirmMessage, nudgeMessage, deleteMessage, editMessage };
}
