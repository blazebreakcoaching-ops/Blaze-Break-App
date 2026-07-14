import admin from 'firebase-admin';
admin.initializeApp();
const db = admin.firestore();
db.collection('users').get().then(console.log).catch(e => console.error(e.message));
