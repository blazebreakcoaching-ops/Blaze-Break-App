import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
                displayName: userRecord.displayName,
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
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setAccessToken(credential.accessToken);
    }
  };

  const signInWithCalendar = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    provider.addScope('https://www.googleapis.com/auth/calendar.events');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setAccessToken(credential.accessToken);
      return credential.accessToken;
    }
    return null;
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

