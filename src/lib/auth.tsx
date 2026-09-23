import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Auth as FirebaseAuth, signInWithPopup, signInAnonymously, linkWithPopup, linkWithCredential, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword, EmailAuthProvider, GoogleAuthProvider, OAuthProvider, FacebookAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, getDb } from './firebase';
import { secureApiFetch } from './secure-api';
import { getMfaSessionToken, setMfaSessionToken, clearMfaSessionToken } from './mfa-session';
import { AuthRole } from '../types';

interface AuthContextType {
  user: (User & { isAdmin?: boolean }) | null;
  appRole: AuthRole;
  loading: boolean;
  accessToken: string | null;
  // True once a signed-in, non-anonymous user with 2FA enabled hasn't yet
  // verified it this session - App.tsx renders MfaChallenge instead of the
  // app while this is true. Always false for anonymous sessions.
  mfaPending: boolean;
  signIn: () => Promise<void>;
  signInWithCalendar: () => Promise<string | null>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  verifyMfaAtSignIn: (codeOrRecoveryCode: string, isRecoveryCode?: boolean) => Promise<void>;
  logOut: () => Promise<void>;
  hasRole: (allowedRoles: AuthRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appRole: 'individual',
  loading: true,
  accessToken: null,
  mfaPending: false,
  signIn: async () => {},
  signInWithCalendar: async () => null,
  signInWithMicrosoft: async () => {},
  signInWithFacebook: async () => {},
  signUpWithEmail: async () => {},
  signInWithEmail: async () => {},
  sendPasswordReset: async () => {},
  verifyMfaAtSignIn: async () => {},
  logOut: async () => {},
  hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

// Standalone, unit-testable versions of every provider's three-step
// sign-in pattern: if the current session is anonymous, link the
// provider to it so the person keeps their existing UID/data; otherwise
// sign in directly; if linking collides with an existing real account
// (auth/credential-already-in-use), sign into that real account instead,
// deliberately abandoning the anonymous session's data. Each provider
// gets its own named function - never a single function parameterised by
// provider name - matching how signInWithGoogle/signInWithGoogleCalendar
// already diverge (calendar scopes are Google-specific, not a generic
// concept every provider needs). These take `authInstance` as a
// parameter rather than importing the live `auth` singleton directly, so
// tests can pass a fake Auth object instead of touching Firebase for
// real. AuthProvider below calls these with the real `auth` singleton
// and layers the Google-specific accessToken side effect on top.
export async function signInWithGoogle(authInstance: FirebaseAuth) {
  const provider = new GoogleAuthProvider();
  try {
    if (authInstance.currentUser?.isAnonymous) {
      return await linkWithPopup(authInstance.currentUser, provider);
    }
    return await signInWithPopup(authInstance, provider);
  } catch (e: any) {
    if (e?.code === 'auth/credential-already-in-use') {
      const existingCredential = GoogleAuthProvider.credentialFromError(e);
      if (existingCredential) {
        return await signInWithCredential(authInstance, existingCredential);
      }
    }
    throw e;
  }
}

export async function signInWithGoogleCalendar(authInstance: FirebaseAuth) {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  try {
    if (authInstance.currentUser?.isAnonymous) {
      return await linkWithPopup(authInstance.currentUser, provider);
    }
    return await signInWithPopup(authInstance, provider);
  } catch (e: any) {
    if (e?.code === 'auth/credential-already-in-use') {
      const existingCredential = GoogleAuthProvider.credentialFromError(e);
      if (existingCredential) {
        return await signInWithCredential(authInstance, existingCredential);
      }
    }
    throw e;
  }
}

// Firebase has no dedicated MicrosoftAuthProvider class - the generic
// OAuthProvider('microsoft.com') exposes the same static
// credentialFromResult/credentialFromError methods GoogleAuthProvider
// does, so the pattern transfers exactly.
export async function signInWithMicrosoft(authInstance: FirebaseAuth) {
  const provider = new OAuthProvider('microsoft.com');
  try {
    if (authInstance.currentUser?.isAnonymous) {
      return await linkWithPopup(authInstance.currentUser, provider);
    }
    return await signInWithPopup(authInstance, provider);
  } catch (e: any) {
    if (e?.code === 'auth/credential-already-in-use') {
      const existingCredential = OAuthProvider.credentialFromError(e);
      if (existingCredential) {
        return await signInWithCredential(authInstance, existingCredential);
      }
    }
    throw e;
  }
}

export async function signInWithFacebook(authInstance: FirebaseAuth) {
  const provider = new FacebookAuthProvider();
  try {
    if (authInstance.currentUser?.isAnonymous) {
      return await linkWithPopup(authInstance.currentUser, provider);
    }
    return await signInWithPopup(authInstance, provider);
  } catch (e: any) {
    if (e?.code === 'auth/credential-already-in-use') {
      const existingCredential = FacebookAuthProvider.credentialFromError(e);
      if (existingCredential) {
        return await signInWithCredential(authInstance, existingCredential);
      }
    }
    throw e;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appRole, setAppRole] = useState<AuthRole>('individual');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  // Set right before signOut() and consumed the next time onAuthStateChanged
  // fires with no user. Without this, an explicit sign-out was indistinguishable
  // from a brand-new visitor, so it immediately spun up a fresh, blank
  // anonymous account - discarding the real one - and the app treated that
  // empty account as someone who'd never onboarded, running onboarding again.
  const explicitSignOutRef = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userRecord) => {
      if (userRecord) {
        (window as any).__ACTIVE_USER_EMAIL__ = userRecord.email;
        
        try {
          const db = await getDb();
          const { doc, getDoc, setDoc } = await import('firebase/firestore');
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

        // 2FA never applies to an anonymous session - only check once this
        // is a real account. Cached per-tab-session in sessionStorage so a
        // page refresh doesn't re-challenge someone who already verified
        // moments ago; a genuinely new browser session always re-checks.
        if (!userRecord.isAnonymous) {
          // A stored token (not just a boolean flag) - it's the exact
          // thing the server checks, so "do we already have a live one"
          // and "do we need to re-challenge" can never drift apart.
          const alreadyVerifiedThisSession = !!getMfaSessionToken(userRecord.uid);

          if (alreadyVerifiedThisSession) {
            setMfaPending(false);
          } else {
            try {
              const res = await secureApiFetch('/api/auth/mfa/status');
              const data = await res.json();
              setMfaPending(data.enabled === true);
            } catch (e) {
              // Fail OPEN, not closed - a transient network error checking
              // 2FA status must never lock someone out of their own
              // account. The mirror image of this app's established
              // "never remove safety to save availability" principle:
              // never ADD a blocking gate on top of a mere connectivity
              // hiccup either.
              console.warn("Could not check two-factor status — continuing without the extra sign-in step this session.", e);
              setMfaPending(false);
            }
          }
        } else {
          setMfaPending(false);
        }

      } else {
        (window as any).__ACTIVE_USER_EMAIL__ = null;
        setAppRole('individual');

        if (explicitSignOutRef.current) {
          // They just deliberately signed out - land them on a clean,
          // properly-signed-out state instead of silently re-authenticating
          // them as a new anonymous stranger who'd look like they need
          // onboarding again.
          explicitSignOutRef.current = false;
        } else {
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
      }
      setUser(userRecord);
      if (!userRecord) {
        setAccessToken(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Thin context wrappers around the standalone, unit-tested functions
  // above (signInWithGoogle et al.) - they hold the actual three-step
  // OAuth logic; this layer just threads through the live `auth`
  // singleton and the React-state side effects (accessToken) that only
  // make sense inside this component.
  const signIn = async () => {
    const result = await signInWithGoogle(auth);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setAccessToken(credential.accessToken);
    }
  };

  const signInWithCalendar = async () => {
    const result = await signInWithGoogleCalendar(auth);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setAccessToken(credential.accessToken);
      return credential.accessToken;
    }
    return null;
  };

  // Deliberately does NOT populate the shared `accessToken` state - that
  // field is consumed elsewhere (CalendarDefenseView.tsx, gmail-signals.ts,
  // etc.) specifically as a Google Calendar/Gmail API token; storing a
  // Microsoft Graph or Facebook Graph token there would silently corrupt
  // those features.
  const handleMicrosoftSignIn = async () => {
    await signInWithMicrosoft(auth);
  };

  const handleFacebookSignIn = async () => {
    await signInWithFacebook(auth);
  };

  // Same anonymous-upgrade pattern as signIn()/signInWithCalendar() above,
  // via EmailAuthProvider instead of GoogleAuthProvider. Unlike Google,
  // there's no embedded-credential trick to salvage a collision with - a
  // failed link here just means the email is already someone's real
  // account, which is a "go sign in instead" message, not a silent merge.
  const signUpWithEmail = async (email: string, password: string) => {
    try {
      if (auth.currentUser?.isAnonymous) {
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(auth.currentUser, credential);
        return;
      }
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      if (e?.code === 'auth/email-already-in-use' || e?.code === 'auth/credential-already-in-use') {
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
    } catch (e: any) {
      if (e?.code === 'auth/email-already-in-use' || e?.code === 'auth/credential-already-in-use') {
        // This email already belongs to someone else's real, pre-existing
        // account, so linking the anonymous session to it can't work -
        // sign straight into that real account with the same email/
        // password already in hand instead. This abandons the anonymous
        // session's data, same as signIn()'s Google fallback above, since
        // the collision has already proven this was never really the
        // anonymous session's identity to keep.
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }
      throw e;
    }
  };

  // Deliberately NOT Firebase's own sendPasswordResetEmail() - the reset
  // email must go out through this app's Brevo integration like every
  // other transactional email it sends, not Firebase's default mailer.
  // The server generates the actual reset link and does the sending;
  // this always resolves (never reveals whether the email has an account).
  const sendPasswordReset = async (email: string) => {
    await secureApiFetch('/api/auth/password-reset/request', { method: 'POST', data: { email } });
  };

  // Called from MfaChallenge.tsx once someone enters a correct code or
  // recovery code at sign-in. Verification itself happens server-side
  // (POST /api/auth/mfa/totp/verify-at-signin, which also enforces the
  // lockout) - this just records the result for this session and clears
  // the gate.
  const verifyMfaAtSignIn = async (codeOrRecoveryCode: string, isRecoveryCode = false) => {
    const res = await secureApiFetch('/api/auth/mfa/totp/verify-at-signin', {
      method: 'POST',
      data: isRecoveryCode ? { recoveryCode: codeOrRecoveryCode } : { code: codeOrRecoveryCode },
    });
    const data = await res.json();
    if (auth.currentUser && data.mfaSessionToken) {
      setMfaSessionToken(auth.currentUser.uid, data.mfaSessionToken);
    }
    setMfaPending(false);
  };

  const logOut = async () => {
    explicitSignOutRef.current = true;
    if (user) {
      clearMfaSessionToken(user.uid);
    }
    await signOut(auth);
    setAccessToken(null);
    setMfaPending(false);
  };
  
  const hasRole = (allowedRoles: AuthRole[]) => {
    // Both owner email variants - see the matching fix/comment on
    // isSuperAdminUser in App.tsx for why this needs both.
    const isSuperAdminUser = user?.email === 'teampublication@gmail.com' || user?.email === 'teampublication@googlemail.com' || (user as any)?.isAdmin === true;
    if (isSuperAdminUser) return true;
    return allowedRoles.includes(appRole);
  };

  return (
    <AuthContext.Provider value={{ user, appRole, loading, accessToken, mfaPending, signIn, signInWithCalendar, signInWithMicrosoft: handleMicrosoftSignIn, signInWithFacebook: handleFacebookSignIn, signUpWithEmail, signInWithEmail, sendPasswordReset, verifyMfaAtSignIn, logOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

