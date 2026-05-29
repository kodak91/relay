import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const COMMUNITY_ID = '__community__';
export const COMMUNITY_ADMIN_EMAIL = 'sss@cv-3.com';

export const COMMUNITY_PROJECT_DATA = {
  id: COMMUNITY_ID,
  name: '커뮤니티',
  type: 'community',
  pf: '커',
  color: 'oklch(0.52 0.19 260)',
  members: [],
};

export function useCommunity(user) {
  const [communityArchived, setCommunityArchived] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    // Bootstrap: create community project doc if it doesn't exist
    const communityRef = doc(db, 'projects', COMMUNITY_ID);
    getDoc(communityRef).then((snap) => {
      if (!snap.exists()) {
        setDoc(communityRef, {
          ...COMMUNITY_PROJECT_DATA,
          adminEmail: COMMUNITY_ADMIN_EMAIL,
          status: '진행중',
          createdAt: new Date().toISOString(),
        });
      }
    });

    // Per-user archive preference stored in users/{uid}
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      setCommunityArchived(snap.data()?.communityArchived ?? false);
    });
    return unsub;
  }, [user?.uid]);

  const toggleArchive = async () => {
    if (!user?.uid) return;
    await setDoc(
      doc(db, 'users', user.uid),
      { communityArchived: !communityArchived },
      { merge: true }
    );
  };

  return {
    communityArchived,
    toggleArchive,
    isAdmin: user?.email === COMMUNITY_ADMIN_EMAIL,
  };
}
