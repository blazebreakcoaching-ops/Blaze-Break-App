#!/usr/bin/env node
/**
 * Blaze Break cloud readiness inventory.
 * READ ONLY: no deploy, IAM change, key issuance, secret fetch or traffic move.
 * External Google Cloud calls run only on the operator's own authenticated
 * machine / Cloud Shell. Raw API JSON (which may contain env values) is
 * NEVER echoed or written. This source-only script is NOT deployment approval.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const index = args.indexOf('--target');
const target = index < 0 ? '' : args[index + 1];
const configArg = args.indexOf('--web-config');
const configPath = configArg < 0 ? '' : args[configArg + 1];
if (!['production', 'staging'].includes(target) ||
    (configArg !== -1 && (!configPath || configPath.startsWith('--')))) {
  console.error('Usage: npm run verify:cloud:readonly -- --target production');
  console.error('   or: npm run verify:cloud:readonly -- --target staging --web-config /path/to/staging-firebase-config.json');
  process.exit(2);
}
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const aliases = load('.firebaserc').projects;
const firebase = load('firebase.json');
const productionProject = aliases.production || aliases.default;
const project = target === 'production' ? productionProject : aliases.staging;
const database = firebase.firestore?.database;
const service = 'blaze-break';
const region = 'europe-west2';

const results = [];
const record = (name, state, detail) => {
  results.push({ name, state, detail });
  console.log((state === 'PASS' ? '[PASS]' : state === 'FAIL' ? '[FAIL]' : '[CHECK]') +
    ' ' + name + ': ' + detail);
};
const validId = v => typeof v === 'string' && /^[a-z][a-z0-9-]{3,60}[a-z0-9]$/.test(v);
if (!validId(project) || !validId(database)) {
  console.error('Configuration is missing valid project or named database ID.');
  process.exit(2);
}
console.log('BLAZE BREAK — READ-ONLY CLOUD PRELIGHT (' + target + ')');
console.log('Expected project: ' + project + ' | service: ' + service + ' | region: ' + region);
record('Named Firestore target', database !== '(default)' ? 'PASS' : 'FAIL',
  database === '(default)' ? 'Wrong: default database' : 'Named database configured');

const configFile = target === 'production' ? 'firebase-applet-config.json' : configPath;
if (!configFile) {
  record('Matching web config', 'FAIL', 'Provide a separate staging Firebase web config with --web-config');
} else {
  try {
    const web = load(configFile);
    const productionWeb = target === 'staging' ? load('firebase-applet-config.json') : null;
    const appIdentityValid = typeof web.appId === 'string' && web.appId.length > 0 &&
      (target !== 'staging' || (project !== productionProject && web.appId !== productionWeb.appId));
    const webMatches = web.projectId === project &&
      web.firestoreDatabaseId === database && appIdentityValid;
    record('Matching web config', webMatches ? 'PASS' : 'FAIL',
      webMatches ? 'Project/database/app identity match' :
        'Web config missing or mismatches target project, database or isolated app identity');
  } catch {
    record('Matching web config', 'FAIL', 'Firebase web config unavailable or invalid');
  }
}
const command = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
const run = parts => {
  // All command arguments are fixed and project/database are validated.
  // In particular, never call auth print-access-token or secrets versions access.
  const p = spawnSync(command, parts, {
    encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (p.status !== 0 || p.error) return null;
  try { return JSON.parse(p.stdout); }
  catch { return null; }
};
const projectInfo = run(['projects','describe',project,'--format=json']);
record('GCP project visible', projectInfo?.projectId === project ? 'PASS' : 'CHECK',
  projectInfo?.projectId === project ? 'Project verified via gcloud' :
    'Cannot inspect project with current gcloud login/permissions');

const dbInfo = run(['firestore','databases','describe',
  '--database='+database,'--project='+project,'--format=json']);
const dbMatch = dbInfo && typeof dbInfo.name === 'string' &&
  dbInfo.name === 'projects/' + project + '/databases/' + database;
record('Firestore named database', dbMatch ? 'PASS' : 'FAIL',
  dbMatch ? 'Target database exists in expected project' :
    'Database could not be verified (may be absent or lack permission)');

const live = run(['run','services','describe',service,
  '--project='+project,'--region='+region,'--format=json']);
const liveName = live?.metadata?.name || live?.name || '';
record('Cloud Run service', liveName === service || liveName.endsWith('/services/' + service)
  ? 'PASS' : 'CHECK',
  live ? 'Service descriptor retrieved' : 'Service unavailable / not authorised');
if (live) {
  const env = live.spec?.template?.spec?.containers?.[0]?.env ||
    live.template?.containers?.[0]?.env || [];
  const get = name => env.find(item => item.name === name)?.value ?? null;
  const nodeEnv = get('NODE_ENV');
  const explicitProject = get('FIREBASE_PROJECT_ID');
  record('Production security mode', nodeEnv === 'production' ? 'PASS' : 'FAIL',
    nodeEnv === 'production' ? 'NODE_ENV production' :
      'NODE_ENV is not explicitly production; verify App Check/CSP enforcement');
  record('Runtime Firebase identity',
    explicitProject === project ? 'PASS' : (explicitProject ? 'FAIL' : 'CHECK'),
    explicitProject === project ? 'Explicit project matches' : explicitProject
      ? 'FIREBASE_PROJECT_ID explicitly mismatches intended project'
      : 'FIREBASE_PROJECT_ID absent; inspect runtime identity without exposing secrets');
  const ready = live.status?.conditions?.find(item => item.type === 'Ready');
  const revision = live.status?.latestReadyRevisionName || live.latestReadyRevision || null;
  record('Serving revision', revision ? 'PASS' : 'CHECK',
    revision ? 'A ready revision is reported' : 'No ready revision reported');
  record('Service readiness', ready?.status === 'True' ? 'PASS' : 'CHECK',
    ready?.status === 'True' ? 'Cloud Run Ready=True' : 'Ready condition needs verification');
  const traffic = live.status?.traffic || live.traffic || [];
  const totalTraffic = traffic.reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
  const validTraffic = traffic.length > 0 && totalTraffic === 100 &&
    traffic.every(item => typeof item.revisionName === 'string' && item.revisionName.length > 0);
  record('Serving traffic', validTraffic ? 'PASS' : 'CHECK',
    validTraffic ? '100% of service traffic assigned to named revision(s)' :
      'Cannot confirm ready revision traffic split; check Cloud Run console');
}
const bad = results.filter(item => item.state === 'FAIL').length;
const unclear = results.filter(item => item.state === 'CHECK').length;
console.log('\nSUMMARY: ' + (bad || unclear ? 'NOT VERIFIED' : 'BASIC INVENTORY PASSED') +
  ' | FAILED=' + bad + ' | CHECK=' + unclear);
console.log('NOT COVERED: App Check live verification; user flows; Firebase Rules MFA gap; IAM roles; secrets values; rollback; paid/native store integrations.');
console.log('No cloud changes made. This is not production release approval.');
if (bad || unclear) process.exitCode = 1;
