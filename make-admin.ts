import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const email = process.argv[2];

if (!email) {
  console.error("Please provide an email address as the first argument.");
  console.error("Usage: npx tsx make-admin.ts <email>");
  process.exit(1);
}

// Read config to extract databaseId
let firebaseConfigProject = undefined;
let firebaseConfigDatabaseId = undefined;
try {
  const firebaseConfigFile = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  firebaseConfigProject = firebaseConfigFile.projectId;
  firebaseConfigDatabaseId = firebaseConfigFile.firestoreDatabaseId;
} catch(e) {}

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfigProject || undefined
  });
}

const db = getFirestore(firebaseConfigDatabaseId);

async function makePlatformOwner() {
  try {
    console.log(`Locating user in Firebase Auth with email: ${email}...`);
    const user = await getAuth().getUserByEmail(email);
    const uid = user.uid;

    console.log(`Setting custom claims for UID ${uid}...`);
    await getAuth().setCustomUserClaims(uid, {
      admin: true,
      role: "platform_owner",
      platformOwner: true
    });

    console.log(`Creating/updating admin_users/${uid} in Firestore...`);
    const adminUserRef = db.collection('admin_users').doc(uid);
    await adminUserRef.set({
      uid: uid,
      email: email,
      displayName: user.displayName || "Coach T",
      role: "platform_owner",
      status: "active",
      permissions: [
        "admin.full_access",
        "users.read",
        "users.manage",
        "content.manage",
        "nova.manage",
        "b2b.manage",
        "billing.manage",
        "safety.read",
        "audit.read",
        "settings.manage"
      ],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "system_bootstrap",
      lastLoginAt: null
    }, { merge: true });

    console.log(`Writing bootstrap audit log to admin_audit_logs...`);
    await db.collection('admin_audit_logs').add({
      actorUid: "system",
      actorEmail: "system",
      actorRole: "system",
      action: "platform_owner_bootstrapped",
      targetUid: uid,
      targetEmail: email,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        role: "platform_owner"
      }
    });

    console.log(`Success! Platform owner access granted to ${email}`);
    process.exit(0);
  } catch (err: any) {
    console.error("Error bootstrapping platform owner:", err.message);
    process.exit(1);
  }
}

makePlatformOwner();
