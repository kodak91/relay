import { useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import useAppStore from '../store/appStore';

export function useAuth() {
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoading = useAppStore((s) => s.setAuthLoading);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const profile = userDoc.exists() ? userDoc.data() : {};
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: profile.name || firebaseUser.displayName || firebaseUser.email,
            role: profile.role || 'member',
            initial: (profile.name || firebaseUser.displayName || firebaseUser.email || '?')[0],
          });
        } catch {
          // Firestore 오류 시 Firebase Auth 기본 정보로 폴백
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || firebaseUser.email,
            role: 'member',
            initial: (firebaseUser.displayName || firebaseUser.email || '?')[0],
          });
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, [setUser, setAuthLoading]);

  const loginWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user);
    return cred.user;
  };

  const register = async (email, password, name, role) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    try {
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email, role: role || 'member',
        createdAt: serverTimestamp(),
      });
    } catch { /* Firestore 실패해도 계속 진행 */ }
    return cred.user;
  };

  const logout = () => signOut(auth);

  return { loginWithEmail, loginWithGoogle, register, logout };
}

async function ensureUserDoc(firebaseUser) {
  try {
    const ref = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: firebaseUser.displayName || firebaseUser.email,
        email: firebaseUser.email,
        role: 'member',
        createdAt: serverTimestamp(),
      });
    }
  } catch { /* ignore */ }
}
