#!/usr/bin/env node
/**
 * Read-only/offline production-candidate engineering verification.
 * Runs local tests/builds ONLY, never git push, GitHub Actions, Firebase
 * deploy, gcloud deploy, EAS builds or live model/payments.
 *
 * --web: the existing ten-stage web/server + emulator/browser gate
 * --all: --web plus native and Firebase Auth blocking Functions test/build
 * Logs remain under release-gate-logs/ (gitignored; mode 0600).
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = process.argv[2];
if (!['--web', '--all'].includes(option) || process.argv.length !== 3) {
  console.error('Usage: npm run verify:web:offline OR npm run verify:integration:offline');
  process.exit(2);
}
const run = (cmd, args, cwd = root) => spawnSync(cmd, args, {
  cwd, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024,
});
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const git = run('git', ['rev-parse', 'HEAD']);
const status = run('git', ['status', '--porcelain']);
const branch = run('git', ['branch', '--show-current']);
if (git.status !== 0 || status.status !== 0 || status.stdout.trim() !== '' ||
    !/^[0-9a-f]{40}$/.test(git.stdout.trim())) {
  console.error('BLOCKED: requires a clean, full Git checkout; no tests were run.');
  process.exit(2);
}
const head = git.stdout.trim();
const expected = process.env.EXPECTED_RELEASE_SHA?.trim();
if (!expected || !/^[0-9a-f]{40}$/.test(expected)) {
  console.error('BLOCKED: EXPECTED_RELEASE_SHA must be the exact reviewed 40-character commit SHA.');
  process.exit(2);
}
if (expected !== head) {
  console.error('BLOCKED: checkout SHA differs from EXPECTED_RELEASE_SHA.');
  process.exit(2);
}
// Do not certify a candidate if a future edit silently re-enables automatic
// GitHub Actions deploys. This check inspects only the top-level YAML trigger
// block, not nested keys elsewhere in the workflow. No workflow is executed.
const deployWorkflow = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
const triggerMatch = deployWorkflow.match(/^on:\\s*\
([\\s\\S]*?)(?=^[^\\s#][^\
]*:|\\s*$)/m);
const triggers = triggerMatch?.[1].split('\
')
  .filter(line => /^ {2}[a-zA-Z_][\\w-]*:/.test(line))
  .map(line => line.trim().split(':', 1)[0]);
if (!triggers || triggers.length !== 1 || triggers[0] !== 'workflow_dispatch' ||
    !/^[ ]{8}default: true\\s*$/m.test(triggerMatch[1])) {
  console.error('BLOCKED: deployment workflow must be manual-only with auth_only default true.');
  process.exit(2);
}

const output = join(root, 'release-gate-logs', 'integrated');
mkdirSync(output, { recursive: true, mode: 0o700 });
chmodSync(output, 0o700);
const checks = [];
const stage = (label, args, cwd = root) => {
  console.log('[INTEGRATION] ' + label);
  const started = new Date().toISOString();
  const result = run(npm, args, cwd);
  const exitCode = result.error ? -1 : (result.status ?? -1);
  const path = join(output, String(checks.length + 1).padStart(2, '0') +
    '-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.log');
  writeFileSync(path, [result.stdout || '', result.stderr || '',
    result.error?.message || ''].join('\n'), { mode: 0o600 });
  checks.push({ label, exitCode, status: exitCode === 0 ? 'PASS' : 'FAIL',
    started, cwd: cwd === root ? '.' : cwd.slice(root.length + 1),
    evidence: path });
  console.log('[' + (exitCode === 0 ? 'PASS' : 'FAIL') + '] ' + label +
    (exitCode !== 0 ? '; inspect ' + path : ''));
  return exitCode === 0;
};

const webPassed = stage('Web ten-stage release gate',
  ['run', 'verify:release:offline', '--', '--all']);

if (option === '--all') {
  const mobile = join(root, 'mobile');
  const nativeInstalled = stage('Native clean install',
    ['ci', '--legacy-peer-deps', '--no-fund'], mobile);
  if (nativeInstalled) {
    stage('Native TypeScript', ['exec', '--no', '--', 'tsc', '--noEmit'], mobile);
    stage('Native lint', ['run', 'lint'], mobile);
    stage('Native Jest', ['test', '--', '--runInBand'], mobile);
  } else checks.push({ label: 'Native downstream checks', status: 'BLOCKED', exitCode: -1 });
  const functions = join(root, 'functions');
  const functionsInstalled = stage('Functions clean install',
    ['ci', '--no-fund'], functions);
  if (functionsInstalled) {
    stage('Functions TypeScript build', ['run', 'build'], functions);
    stage('Functions unit tests', ['test'], functions);
  } else checks.push({ label: 'Functions downstream checks', status: 'BLOCKED', exitCode: -1 });
}
const passed = webPassed && checks.every(x => x.status === 'PASS') &&
  checks.length === (option === '--web' ? 1 : 8);
const report = {
  sourceSha: head,
  branch: branch.stdout.trim(),
  scope: option === '--web' ? 'web-source-offline' : 'all-source-offline',
  outcome: passed ? 'OFFLINE_CHECKS_PASS__NOT_PRODUCTION_APPROVAL' :
    'BLOCKED_OR_FAILED__NOT_VERIFIED',
  generatedAt: new Date().toISOString(),
  checks,
  notCovered: [
    'MFA session enforcement on direct Firestore SDK access',
    'Authenticated staging Firebase/GCloud project verification',
    'PR #155 and production merge approval',
    'Real Stripe/OAuth/Twilio delivery and legal/safeguarding sign-offs',
    'Native EAS signed builds, physical devices and app-store acceptance',
    'Cloud Run deployment/rollback and actual production smoke checks',
  ],
};
const reportPath = join(output, 'latest.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log('\n[INTEGRATION] ' + report.outcome + '\nSHA: ' + head +
  '\nEvidence: ' + reportPath);
process.exitCode = passed ? 0 : 1;
