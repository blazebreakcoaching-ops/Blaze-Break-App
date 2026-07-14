import admin from 'firebase-admin';
admin.initializeApp();
console.log(admin.app().options);
