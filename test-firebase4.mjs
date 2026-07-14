import admin from 'firebase-admin';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

admin.initializeApp({ projectId: config.projectId }); 

async function test() {
  try {
    const users = await admin.auth().listUsers(1);
    console.log("SUCCESS AUTH:", users.users.length);
  } catch(e) {
    console.error("ERROR 4:", e.message);
  }
}

test();
