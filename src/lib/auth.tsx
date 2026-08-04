import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signInAnonymously, linkWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AuthRole } from '../types';

interface AuthContextType {
  user: (User & { isAdmin?: boolean }) | null;
  appRole: AuthRole;
  loading: boolean;
  accessToken: string | null;
  signIn: () => Promise<void>;
  signInWithCalendar: () => Promise<string | null>;
  logOut: () => Promise<void>;
  hasRole: (allowedRoles: AuthRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appRole: 'individual',
  loading: true,
  accessToken: null,
  signIn: async () => {},
  signInWithCalendar: async () => null,
  logOut: async () => {},
  hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appRole, setAppRole] = useState<AuthRole>('individual');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userRecord) => {
      if (userRecord) {
        (window as any).__ACTIVE_USER_EMAIL__ = userRecord.email;
        
        try {
          const userDocRef = doc(db, 'users', userRecord.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
             await setDoc(userDocRef, {
                ...(userRecord.displayName ? { displayName: userRecord.displayName } : {}),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
             });
          }

          // Fetch protected role from entitlements
          const entitlementsRef = doc(db, 'users', userRecord.uid, 'entitlements', 'status');
          const entitlementsDoc = await getDoc(entitlementsRef);
          
          let role: AuthRole = 'individual';
          if (entitlementsDoc.exists()) {
            role = entitlementsDoc.data().role || 'individual';
          }

          // Check custom claims for role
          try {
            const tokenResult = await userRecord.getIdTokenResult();
            const claims = tokenResult.claims;
            if (claims.admin || claims.platform_admin || claims.platformOwner || userRecord.email === 'teampublication@gmail.com' || userRecord.email === 'teampublication@googlemail.com') {
              (userRecord as any).isAdmin = true;
            }
            if (claims.role) {
              role = claims.role as AuthRole;
            } else if (userRecord.email === 'teampublication@gmail.com' || userRecord.email === 'teampublication@googlemail.com') {
              role = 'platform_owner';
            }
          } catch(e) {
            console.warn("Could not read custom claims from ID token — defaulting to standard role.", e);
          }

          setAppRole(role);
        } catch (e) {
          console.error("Authorised Access Framework mapping failed:", e);
          setAppRole('individual');
        }

      } else {
        (window as any).__ACTIVE_USER_EMAIL__ = null;
        setAppRole('individual');
        // Nobody signed in at all yet (not even anonymously) - this fires
        // once, right after the app first loads for a brand-new visitor.
        // Signing in anonymously here means every feature that reads
        // auth.currentUser gets a real, Firestore-backed identity from the
        // first moment, instead of a local-only/"demo" fallback.
        try {
          await signInAnonymously(auth);
          // Don't set user/loading below for this invocation - that would
          // briefly flash a logged-out state. onAuthStateChanged fires again
          // momentarily with the real anonymous userRecord, and that
          // invocation sets user/loading correctly instead.
          return;
        } catch (e) {
          console.error("Anonymous sign-in failed - features requiring a signed-in user will be unavailable until the user signs in manually.", e);
        }
      }
      setUser(userRecord);
      if (!userRecord) {
        setAccessToken(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // If the current session is anonymous, link Google to it so the
      // person keeps the same UID (and therefore all their existing data)
      // instead of ending up on a brand-new, separate account.
      if (auth.currentUser?.isAnonymous) {
        const result = await linkWithPopup(auth.currentUser, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          setAccessToken(credential.accessToken);
        }
        return;
      }
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
      }
    } catch (e: any) {
      // That Google account already has its own real Firebase account from
      // a previous session (e.g. they used the app before, then later
      // browsed anonymously on a different device/browser). Linking can't
      // merge two separate accounts, so sign them into their real,
      // pre-existing one instead - the anonymous session's data is
      // abandoned, but that's correct: it was never really theirs to keep,
      // just a placeholder until they proved who they are.
      if (e?.code === 'auth/credential-already-in-use') {
        const existingCredential = GoogleAuthProvider.credentialFromError(e);
        if (existingCredential) {
          const result = await signInWithCredential(auth, existingCredential);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            setAccessToken(credential.accessToken);
          }
          return;
        }
      }
      throw e;
    }
  };

  const signInWithCalendar = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    provider.addScope('https://www.googleapis.com/auth/calendar.events');
    try {
      if (auth.currentUser?.isAnonymous) {
        const result = await linkWithPopup(auth.currentUser, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          setAccessToken(credential.accessToken);
          return credential.accessToken;
        }
        return null;
      }
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        return credential.accessToken;
      }
      return null;
    } catch (e: any) {
      if (e?.code === 'auth/credential-already-in-use') {
        const existingCredential = GoogleAuthProvider.credentialFromError(e);
        if (existingCredential) {
          const result = await signInWithCredential(auth, existingCredential);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            setAccessToken(credential.accessToken);
            return credential.accessToken;
          }
        }
        return null;
      }
      throw e;
    }
  };

  const logOut = async () => {
    await signOut(auth);
    setAccessToken(null);
  };
  
  const hasRole = (allowedRoles: AuthRole[]) => {
    const isSuperAdminUser = user?.email === 'teampublication@gmail.com' || (user as any)?.isAdmin === true;
    if (isSuperAdminUser) return true;
    return allowedRoles.includes(appRole);
  };

  return (
    <AuthContext.Provider value={{ user, appRole, loading, accessToken, signIn, signInWithCalendar, logOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

