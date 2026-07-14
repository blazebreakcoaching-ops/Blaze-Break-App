import admin from 'firebase-admin';
import { getFirestore as adminGetFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

admin.initializeApp({ projectId: config.projectId }); 

const db = adminGetFirestore(undefined, config.firestoreDatabaseId);

async function test() {
  try {
    const snap = await db.collection('users').get();
    console.log("SUCCESS:", snap.size);
  } catch(e) {
    console.error("ERROR 2:", e.message);
  }
}

test();
