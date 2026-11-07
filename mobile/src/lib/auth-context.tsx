// Trimmed RN port of ../../../src/lib/auth.tsx. Keeps the parts every
// Phase 1 screen needs (anonymous-first sign-in, email/password with
// anonymous-session upgrade, sign-out) and drops what's out of scope
// this phase: social providers other than email (Google native sign-in
// needs its own extra native config), an interactive MFA challenge and
// email-verification banners. Native must still CHECK the MFA-enabled
// claim and block access until it has a real second-factor experience.
// This client gate does not replace Firestore rules or server enforcement.
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
import { classifyNativeAccountSecurity, type NativeAccountSecurity } from './native-account-security';
import { mayCommitNativeAuthCallback } from './native-auth-callback';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  securityGate: NativeAccountSecurity;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  securityGate: 'unverified',
  signUpWithEmail: async () => {},
  signInWithEmail: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // An MFA-enabled web account must not enter native screens while this
  // application has no native second-factor challenge. This is a CLIENT
  // containment gate; Firestore rules still need their own security review.
  const [securityGate, setSecurityGate] = useState<NativeAccountSecurity>('unverified');
  // Same purpose as web's explicitSignOutRef: without it, an explicit
  // sign-out is indistinguishable from a brand-new visitor and the app
  // immediately spins up a fresh anonymous session, discarding the real
  // one's data from view.
  const explicitSignOutRef = useRef(false);
  const settledAuthUidRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async (userRecord) => {
      const current = ++generation;
      const nextUid = userRecord?.uid ?? null;
      if (nextUid !== settledAuthUidRef.current) {
        setUser(null);
        setSecurityGate('unverified');
      }
      setLoading(true);
      const stillCurrent = () => mayCommitNativeAuthCallback(
        current, generation, nextUid, auth.currentUser?.uid ?? null, active,
      );
      if (userRecord) {
        let gate: NativeAccountSecurity = 'clear';
        if (!userRecord.isAnonymous) {
          try {
            // The backend checks the identical mfaEnabled custom claim for
            // REST requests. Refresh it BEFORE any native Firestore read.
            const result = await userRecord.getIdTokenResult(true);
            gate = classifyNativeAccountSecurity(false, result.claims);
          } catch {
            gate = 'unverified'; // Fail closed if claims cannot be checked.
          }
        }
        if (!stillCurrent()) return;
        settledAuthUidRef.current = userRecord.uid;
        setSecurityGate(gate);
        setUser(userRecord);
        if (gate !== 'clear') {
          setLoading(false);
          return; // No native Firestore read or user-document write.
        }
        try {
          const db = await getDb();
          const { doc, getDoc, setDoc } = await import('firebase/firestore');
          if (!stillCurrent()) return;
          const userDocRef = doc(db, 'users', userRecord.uid);
          const userDoc = await getDoc(userDocRef);
          if (!stillCurrent()) return;
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
        if (!stillCurrent()) return;
        setSecurityGate('clear');
        setLoading(false);
      } else if (explicitSignOutRef.current) {
        explicitSignOutRef.current = false;
        if (!stillCurrent()) return;
        settledAuthUidRef.current = null;
        setSecurityGate('clear');
        setUser(null);
        setLoading(false);
      } else {
        setSecurityGate('unverified');
        setUser(null);
        try {
          await signInAnonymously(auth);
          // An Auth state event will arrive with the new anonymous user.
        } catch (e) {
          if (!stillCurrent()) return;
          console.error('Anonymous sign-in failed:', e);
          setUser(null);
          setLoading(false);
        }
      }
    });
    return () => {
      active = false;
      generation++;
      unsubscribe();
    };
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
    try {
      await signOut(auth);
    } catch (e) {
      explicitSignOutRef.current = false;
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, securityGate, signUpWithEmail, signInWithEmail, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
