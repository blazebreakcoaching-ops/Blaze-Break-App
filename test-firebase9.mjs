import admin from 'firebase-admin';
import { getFirestore as adminGetFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

process.env.GOOGLE_CLOUD_PROJECT = config.projectId;
process.env.GCLOUD_PROJECT = config.projectId;

admin.initializeApp(); 

const db = adminGetFirestore(admin.app(), config.firestoreDatabaseId);

async function test() {
  try {
    const snap = await db.collection('users').get();
    console.log("SUCCESS DB:", snap.size);
  } catch(e) {
    console.error("ERROR 9:", e.message);
  }
}

test();
