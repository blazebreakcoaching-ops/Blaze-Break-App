// Trimmed RN port of ../../../src/lib/auth.tsx. Keeps the parts every
// Phase 1 screen needs (anonymous-first sign-in, email/password with
// anonymous-session upgrade, sign-out) and drops what's out of scope
// this phase: social providers other than email (Google native sign-in
// needs its own extra native config, tracked separately), MFA, role/
// entitlement claims (nothing in Phase 1 is role-gated), email
// verification banners. All kept logic is copied as-is from the web
// version since it's pure Firebase Auth SDK calls, not browser-specific.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  signInAnonymously,
  linkWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, getDb } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signUpWithEmail: async () => {},
  signInWithEmail: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Same purpose as web's explicitSignOutRef: without it, an explicit
  // sign-out is indistinguishable from a brand-new visitor and the app
  // immediately spins up a fresh anonymous session, discarding the real
  // one's data from view.
  const explicitSignOutRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userRecord) => {
      if (userRecord) {
        try {
          const db = await getDb();
          const { doc, getDoc, setDoc } = await import('firebase/firestore');
          const userDocRef = doc(db, 'users', userRecord.uid);
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              ...(userRecord.displayName ? { displayName: userRecord.displayName } : {}),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.warn('Could not ensure user document exists:', e);
        }
        setUser(userRecord);
        setLoading(false);
      } else if (explicitSignOutRef.current) {
        explicitSignOutRef.current = false;
        setUser(null);
        setLoading(false);
      } else {
        try {
          await signInAnonymously(auth);
          // Don't set state here - onAuthStateChanged fires again
          // momentarily with the real anonymous userRecord.
        } catch (e) {
          console.error('Anonymous sign-in failed:', e);
          setUser(null);
          setLoading(false);
        }
      }
    });
    return unsubscribe;
  }, []);

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      if (auth.currentUser?.isAnonymous) {
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(auth.currentUser, credential);
        return;
      }
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
        throw new Error('An account with this email already exists. Try signing in instead.');
      }
      throw e;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      if (auth.currentUser?.isAnonymous) {
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(auth.currentUser, credential);
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }
      throw e;
    }
  };

  const logOut = async () => {
    explicitSignOutRef.current = true;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUpWithEmail, signInWithEmail, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
