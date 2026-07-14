import fs from 'fs';
import * as njre from 'njre';
import { execSync } from 'child_process';
import path from 'path';

async function main() {
  console.log('Installing JRE...');
  const jreDir = await njre.install(21, { dir: path.join(process.cwd(), 'jre'), os: 'linux', arch: process.arch, openjdk_impl: 'hotspot' });
  
  const dirs = fs.readdirSync(jreDir);
  console.log('Dirs:', dirs);
  
  const javaHome = path.join(jreDir, dirs[0]);
  const javaBin = path.join(javaHome, 'bin');
  process.env.PATH = `${javaBin}:${process.env.PATH}`;
  try {
    execSync('java -version', { stdio: 'inherit' });
    execSync('npx -y firebase emulators:exec "npx -y node test-rules.cjs"', { stdio: 'inherit', env: { ...process.env, TEST_MODE: "true", GCLOUD_PROJECT: "blaze-break-test", FIREBASE_PROJECT: "blaze-break-test" } });
  } catch (e) { console.error('Error running java', e); }
}

main().catch(console.error);
