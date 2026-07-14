const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('fs');

async function run() {
  let testEnv;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-test",
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });

    const alice = testEnv.authenticatedContext("alice", { email: "alice@example.com" });
    
    // Test Checkin creation
    const docRef = alice.firestore().collection("users").doc("alice").collection("checkins").doc("123");
    await docRef.set({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      energyLevel: 5,
      focusLevel: 5,
      detachmentLevel: 5,
      stressLoad: 5,
      source: 'user'
    });
    console.log("SUCCESS checkin!");
  } catch (e) {
    console.error("ERROR checkin:", e);
  } finally {
    if (testEnv) await testEnv.cleanup();
  }
}

run();
