import { execSync } from 'child_process';

async function runLocalEmulatorTest() {
  console.log('Running emulator for API tests...');
  try {
    execSync('npx -y firebase emulators:exec "npx tsx run-integration-tests.ts"', { stdio: 'inherit', env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", TEST_MODE: "true" }});
  } catch (e) {
    console.error('Emulator run failed', e);
  }
}
runLocalEmulatorTest();
