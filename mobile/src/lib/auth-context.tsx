// Trimmed RN port of ../../../src/lib/auth.tsx. Keeps the parts every
// Phase 1 screen needs (anonymous-first sign-in, email/password with
// anonymous-session upgrade, sign-out) and drops what's out of scope
// this phase: social providers other than email (Google native sign-in
// needs its own extra native config) and email-verification banners.
// Accounts with two-factor on are held at the native challenge
// (MfaChallengeScreen) until the server verifies a code for THIS sign-in;
// the server and Firestore rules enforce the same requirement independently.
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
import { secureApiFetch, SecureApiError } from './secure-api';
import { setMfaSessionToken, getMfaSessionToken, clearMfaSessionToken, onMfaSessionExpired } from './mfa-session';
import { buildMfaSubmission, describeMfaFailure, extractMfaSessionToken, type MfaMode } from './mfa-challenge';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  securityGate: NativeAccountSecurity;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  /** Verifies a two-factor code for the current sign-in. Resolves to an error message, or null on success. */
  verifyMfa: (mode: MfaMode, value: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  securityGate: 'unverified',
  signUpWithEmail: async () => {},
  signInWithEmail: async () => {},
  logOut: async () => {},
  verifyMfa: async () => 'Not ready.',
});

// Ensures the signed-in account has its profile document. Runs only once
// the account is cleared to read app data (after two-factor if enabled).
async function ensureUserDocument(userRecord: User, stillCurrent: () => boolean): Promise<void> {
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
}

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
        // A different account (or none): never carry a verification over.
        clearMfaSessionToken();
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
            // Already verified in this app session for this same account
            // (e.g. a token refresh re-fired this listener).
            if (gate === 'mfa_required' && getMfaSessionToken(userRecord.uid)) gate = 'clear';
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
        await ensureUserDocument(userRecord, stillCurrent);
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

  // Server reported the two-factor session expired or was revoked: return
  // the SAME account to the challenge (no data screens in the meantime).
  useEffect(() => onMfaSessionExpired(() => {
    if (auth.currentUser && !auth.currentUser.isAnonymous) setSecurityGate('mfa_required');
  }), []);

  const verifyMfa = async (mode: MfaMode, value: string): Promise<string | null> => {
    const submission = buildMfaSubmission(mode, value);
    if (!submission.ok) return submission.message;
    const verifyingUid = auth.currentUser?.uid ?? null;
    if (!verifyingUid) return 'You have been signed out. Please sign in again.';
    let token: string | null = null;
    try {
      const res = await secureApiFetch('/api/auth/mfa/totp/verify-at-signin', { method: 'POST', data: submission.body, noAuthRetry: true });
      token = extractMfaSessionToken(await res.json());
    } catch (e) {
      return describeMfaFailure(e instanceof SecureApiError ? e.status : -1);
    }
    // The account may have changed while the request was in flight.
    const stillSameAccount = () => auth.currentUser?.uid === verifyingUid;
    if (!token || !stillSameAccount()) {
      return token ? 'Your account changed during verification. Please sign in again.' : describeMfaFailure(-1);
    }
    setMfaSessionToken(verifyingUid, token);
    const current = auth.currentUser;
    if (current) await ensureUserDocument(current, stillSameAccount);
    if (!stillSameAccount()) return 'Your account changed during verification. Please sign in again.';
    setSecurityGate('clear');
    return null;
  };

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
    clearMfaSessionToken();
    explicitSignOutRef.current = true;
    try {
      await signOut(auth);
    } catch (e) {
      explicitSignOutRef.current = false;
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, securityGate, signUpWithEmail, signInWithEmail, logOut, verifyMfa }}>
      {children}
    </AuthContext.Provider>
  );
};
