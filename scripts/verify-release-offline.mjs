#!/usr/bin/env node
// Local-only engineering gate: no GitHub Actions, deployment or live Gemini calls.
// npm ci/audit may access the public npm registry. Run from a clean checkout.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Set(process.argv.slice(2));
const usage = 'Usage: npm run verify:release:offline -- [--all] [--skip-install]';
if (flags.has('--help')) {
  console.log(usage + '\n--all adds browser and emulator checks. --skip-install cannot pass the release gate.');
  process.exit(0);
}
if ([...flags].some((a) => !['--all', '--skip-install'].includes(a)) ||
    !existsSync(join(root, 'package.json')) || !existsSync(join(root, 'package-lock.json'))) {
  console.error(usage + '\nA full Git checkout with package-lock.json is required.');
  process.exit(2);
}
const all = flags.has('--all');
const cleanInstall = !flags.has('--skip-install');
// NHEI_EDUCATIONAL_MODE_ENABLED is deliberately left unset, not set to
// 'false': nhei-educational-mode-flag.test.ts and
// nhei-educational-chat-integration.route.test.ts assert this exact env
// var is `undefined` (not merely falsy) to prove the real default-off
// path - the one nothing-sets-it path a genuine deployment starts from.
// Setting it to the string 'false' here made both tests fail without
// changing the actual disabled behaviour, since nheiEducationalModeIsEnabledNow()
// already treats "unset" as off.
const env = { ...process.env, NOVA_LIVE_CHAT_EVAL: '0', GEMINI_API_KEY: '',
  CALENDAR_PROTECTION_EXECUTION_ENABLED: 'false',
  NHEI_RETENTION_SWEEP_ENABLED: 'false',
  TEST_MODE: 'true' };
delete env.NHEI_EDUCATIONAL_MODE_ENABLED;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Deliberately NOT under `test-results/`: both playwright.config.ts and
// playwright.realapp.config.ts use Playwright's default outputDir, which
// is `test-results/` at the repo root, and Playwright CLEARS that entire
// directory at the start of every run. When this script's own log folder
// lived at `test-results/offline-release-gate` (its previous location),
// the first Playwright stage silently deleted every earlier stage's log
// file, and the second Playwright stage then deleted the first Playwright
// stage's log too - leaving only the very last stage's log on disk
// despite all ten stages having actually run and passed. (An earlier fix
// here only recreated the directory before each write to stop that
// deletion from crashing the process with ENOENT; it did not stop the
// deletion itself.) Living in a sibling directory Playwright never
// touches is what actually preserves every stage's evidence.
const outDir = join(root, 'release-gate-logs');
mkdirSync(outDir, { recursive: true });
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0 || !git.stdout.trim()) {
  console.error('ABORT: A Git commit SHA is required to tie test results to source.');
  process.exit(2);
}
// TEST_MODE='true' tells server.ts to skip app.listen() entirely (see
// server.ts's own `if (process.env.TEST_MODE !== 'true') { setupVite().then(...) }`)
// so Vitest/Components/the Firebase-emulator stage can import `app`
// directly without opening a real port. Both Playwright webServer
// configs that run `npx tsx server.ts` as an actual listening process
// (playwright.realapp.config.ts; playwright.config.ts itself runs plain
// `vite`, unaffected) inherit this same env and therefore never listen
// either - Playwright then reports "Process from config.webServer
// exited early" with no further detail, since the Node process just
// finishes its top-level script and exits 0, no error thrown. Those two
// stages get a derived env with TEST_MODE removed so the real webServer
// actually starts.
const playwrightEnv = { ...env };
delete playwrightEnv.TEST_MODE;
const results = [];
function run(label, argv, runEnv = env) {
  console.log('\n[RELEASE-GATE] ' + label);
  const startedAt = new Date().toISOString();
  const proc = spawnSync(npmCmd, argv, { cwd: root, env: runEnv, shell: false,
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const code = proc.error ? -1 : (proc.status ?? -1);
  const path = join(outDir, String(results.length + 1).padStart(2, '0') + '-' +
    label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.log');
  const log = [proc.stdout || '', proc.stderr || '', proc.error?.message || ''].join('\n');
  // outDir lives outside `test-results/` precisely so a Playwright stage
  // can never delete it (see the comment where outDir is defined above).
  // Recreating it before every write is cheap, idempotent, and keeps this
  // safe even if something else ever removes it mid-run.
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path, log, { mode: 0o600 });
  results.push({ label, argv, status: code === 0 ? 'PASS' : 'FAIL', exitCode: code, startedAt, logPath: path });
  console.log('[' + (code === 0 ? 'PASS' : 'FAIL') + '] ' + label + ' — ' + path);
  if (code !== 0) console.error(log.slice(-1600));
  return code === 0;
}
const installOK = !cleanInstall || run('Clean install', ['ci', '--legacy-peer-deps', '--no-fund']);
if (installOK) {
  run('Dependency audit', ['audit', '--audit-level=high']);
  run('TypeScript', ['run', 'lint']);
  run('ESLint', ['exec', '--no', '--', 'eslint', '.', '--config', 'eslint.cleanup.config.js']);
  run('Production build', ['run', 'build']);
  run('Vitest', ['test']);
  run('Components', ['run', 'test:components']);
  if (all) {
    run('Firebase emulator', ['exec', '--no', '--', 'firebase', 'emulators:exec',
      '--only', 'firestore,auth', '--project', 'default', 'npm run test:emulator']);
    run('Playwright preview', ['run', 'test:e2e'], playwrightEnv);
    run('Playwright real app', ['run', 'test:e2e:realapp'], playwrightEnv);
  }
}
const passed = all && cleanInstall && results.length === 10 &&
  results.every((item) => item.status === 'PASS');
const report = { verdict: passed ? 'ENGINEERING_CHECKS_PASS__NOT_DEPLOYMENT_APPROVAL' :
  'NOT_VERIFIED_FOR_RELEASE', headSha: git.stdout.trim(), branch: branch.stdout.trim(),
  node: process.version, generatedAt: new Date().toISOString(),
  requested: { all, cleanInstall }, results,
  caveat: 'Passing checks do not authorise deployment, paid AI calls or independent safeguarding approval.' };
const reportPath = join(outDir, 'latest.json');
mkdirSync(outDir, { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log('\n[RELEASE-GATE] ' + report.verdict + '\nEvidence: ' + reportPath);
process.exitCode = passed ? 0 : 1;
