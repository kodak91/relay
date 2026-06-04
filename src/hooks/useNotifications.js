import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useNotifications(uid) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications', uid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  const unreadCount = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read);
    if (!uid || unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, 'notifications', uid, 'items', n.id), { read: true });
    });
    await batch.commit().catch(() => {});
  };

  return { unreadCount, markAllRead };
}
