import fs from 'fs';
import * as njre from 'njre';
import { execSync } from 'child_process';
import path from 'path';

async function main() {
  const jreDir = path.join(process.cwd(), 'jre');
  const dirs = fs.readdirSync(jreDir);
  const javaHome = path.join(jreDir, dirs[0]);
  const javaBin = path.join(javaHome, 'bin');
  process.env.PATH = `${javaBin}:${process.env.PATH}`;
  try {
    execSync('npx -y firebase emulators:exec "npx node test-rules.cjs"', { stdio: 'inherit', env: { ...process.env, TEST_MODE: "true", GCLOUD_PROJECT: "ais-europe-west2-04e495469f024", FIREBASE_PROJECT: "ais-europe-west2-04e495469f024" } });
  } catch (e) {
    console.error('Error running emulators:', e);
  }
}

main().catch(console.error);
