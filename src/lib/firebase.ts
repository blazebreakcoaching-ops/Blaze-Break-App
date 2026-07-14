import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); // Enterprise config
export const auth = getAuth(app);

// Prepare App Check (observation/test mode)
// The actual site key must be configured in environment variables or via the console UI.
// For Phase 1D-B, we prepare this so it is ready once a reCAPTCHA Enterprise key is provided.
export let appCheck: any = null;
if (typeof window !== 'undefined' && (import.meta as any).env?.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider((import.meta as any).env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
    console.log("App Check initialized successfully with reCAPTCHA Enterprise.");
  } catch (err) {
    console.error("App Check failed to initialize", err);
  }
}

export async function getAppCheckToken(forceRefresh: boolean = false): Promise<string> {
  if (!appCheck) return "";
  try {
    const tokenResult = await getToken(appCheck, forceRefresh);
    return tokenResult.token;
  } catch (e: any) {
    console.warn("Failed to get App Check token:", e.message);
    return "";
  }
}

export async function testFirebaseConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connected successfully");
  } catch (error: any) {
    if (error.message && error.message.includes('the client is offline')) {
      console.warn("Firebase client is offline. Local data will be used.");
    } else {
      console.log("Firebase connection test complete (expected permission error because test/connection is blocked by rules).");
    }
  }
}

