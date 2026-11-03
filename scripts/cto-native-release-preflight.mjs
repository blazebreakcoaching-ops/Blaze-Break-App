#!/usr/bin/env node
// Read-only source/build configuration audit. It never contacts Firebase,
// changes Google Cloud, invokes GitHub Actions, or deploys anything.
// Missing setup is a real blocker, not something to bypass.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const get = (p) => readFileSync(resolve(root, p), 'utf8');
const arg = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const target = arg('--target');
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

if (!['staging', 'production'].includes(target)) {
  console.error('Usage: node scripts/cto-native-release-preflight.mjs --target staging|production');
  process.exit(2);
}
const releaseProject = JSON.parse(get('.firebaserc')).projects[target];
const expo = JSON.parse(get('mobile/app.json')).expo;
const sdk = JSON.parse(get('mobile/package.json'));
const appCheckSource = get('mobile/src/lib/app-check.ts');

check('Named Firebase project', !!releaseProject && releaseProject !== 'default', 'Explicit project alias required');
check('Production and staging remain separate',
  target !== 'staging' || releaseProject !== JSON.parse(get('.firebaserc')).projects.production,
  'Never test against the production project');
check('Native identifiers', !!expo.ios?.bundleIdentifier && !!expo.android?.package, 'Bundle/package identifiers set');
check('Android Firebase config', existsSync(resolve(root, 'mobile/google-services.json')), 'Native Firebase Android app config required');
check('iOS Firebase config', existsSync(resolve(root, 'mobile/GoogleService-Info.plist')), 'Native Firebase iOS app config required');
check('Native App Check implemented',
  !/return\s*['"]{2}\s*;/.test(appCheckSource) &&
    sdk.dependencies?.['@react-native-firebase/app-check'] &&
    sdk.dependencies?.['@react-native-firebase/app'],
  'No empty-token stub; real native attestation required');
check('Native App Check build plugins',
  Array.isArray(expo.plugins) && expo.plugins.some(p => String(Array.isArray(p) ? p[0] : p).includes('react-native-firebase')),
  'Expo Go cannot attest native apps; use configured development/release builds');

let base;
try {
  base = new URL(process.env.EXPO_PUBLIC_API_BASE_URL || '');
} catch { /* missing config is reported below */ }
const validBase = !!base && base.protocol === 'https:' &&
  !base.username && !base.password && !base.search && !base.hash &&
  (base.pathname === '' || base.pathname === '/');
check('Explicit HTTPS API origin', validBase, 'Set EXPO_PUBLIC_API_BASE_URL for the intended deployment environment');

const publicProject = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
const namedDb = process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID || '';
const firebasePublicKeys = ['API_KEY', 'AUTH_DOMAIN', 'APP_ID', 'FIRESTORE_DATABASE_ID'];
check('Complete public Firebase app config',
  firebasePublicKeys.every(k => !!process.env['EXPO_PUBLIC_FIREBASE_' + k]),
  'Require explicit EXPO_PUBLIC_FIREBASE_* values for each build');
check('Firebase project matches deployment target',
  publicProject === releaseProject,
  'Native Auth/Firestore MUST NOT point at a different project than the intended target');
check('Explicit Firestore database ID',
  !!namedDb && !/^replace|^your/i.test(namedDb),
  'Verify that the named database actually exists in the selected Firebase project');
check('No web production config import in native',
  !get('mobile/src/lib/firebase.ts').includes("from '../../../firebase-applet-config.json'"),
  'A staging native build must never inherit production Auth/Firestore config');
check('No silent production API fallback', !get('mobile/src/lib/config.ts').includes("|| 'https://blaze-break-"),
  'Staging must not silently point at the live service');

console.log('Blaze Break native release preflight (' + target + ', source/config only)');
for (const r of results) console.log((r.ok ? 'PASS' : 'BLOCKED') + '  ' + r.name + ' — ' + r.detail);
const blockers = results.filter(r => !r.ok).length;
console.log(blockers ? '\nBLOCKED: ' + blockers + ' prerequisites remain.' : '\nSOURCE CONFIG CHECKS PASS — NOT device or deployment approval.');
if (blockers) process.exitCode = 1;
