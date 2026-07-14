import njre from 'njre';
import { execSync } from 'child_process';
import path from 'path';

async function main() {
  console.log('Installing JRE...');
  const jreDir = await njre.install(21, { os: 'linux', arch: process.arch, openjdk_impl: 'hotspot' });
  console.log('JRE installed at:', jreDir);
  const javaPath = path.join(jreDir, 'bin');
  
  console.log('Setting PATH:', javaPath);
  process.env.PATH = `${javaPath}:${process.env.PATH}`;
  
  console.log(execSync('java -version', { encoding: 'utf-8', stdio: 'pipe' }).toString());
}

main().catch(console.error);
