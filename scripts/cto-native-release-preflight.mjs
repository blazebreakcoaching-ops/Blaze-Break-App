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
check('Native automatic appearance configuration',
  expo.userInterfaceStyle === 'automatic',
  'Light, Dark and System need userInterfaceStyle: automatic');
check('Android system appearance dependency',
  !!sdk.dependencies?.['expo-system-ui'],
  'Install expo-system-ui matching Expo SDK 57 using expo install and update package-lock before native release');
check('Native appearance provider present',
  existsSync(resolve(root, 'mobile/src/lib/native-theme.tsx')) &&
  existsSync(resolve(root, 'mobile/src/lib/native-theme-palette.ts')),
  'Native theme provider and palette must be present');
check('Android Firebase config', existsSync(resolve(root, 'mobile/google-services.json')), 'Native Firebase Android app config required');
check('iOS Firebase config', existsSync(resolve(root, 'mobile/GoogleService-Info.plist')), 'Native Firebase iOS app config required');

// Check project and app identity, not merely the presence of a config file.
// Otherwise a production google-services.json placed in a staging build
// would silently authenticate against production.
let android;
try { android = JSON.parse(get('mobile/google-services.json')); } catch { /* blocked below */ }
const androidPackages = android?.client?.map(x => x.client_info?.android_client_info?.package_name) || [];
check('Android Firebase project/package match',
  android?.project_info?.project_id === releaseProject && androidPackages.includes(expo.android?.package),
  'Android config must match the selected project AND app package');

let iosPlist = '';
try { iosPlist = get('mobile/GoogleService-Info.plist'); } catch { /* blocked below */ }
const iosValue = key => iosPlist.match(new RegExp('<key>\\s*' + key + '\\s*</key>\\s*<string>([^<]+)</string>'))?.[1];
check('iOS Firebase project/bundle match',
  iosValue('PROJECT_ID') === releaseProject && iosValue('BUNDLE_ID') === expo.ios?.bundleIdentifier,
  'iOS config must match the selected project AND bundle identifier');
// A real implementation legitimately still returns '' on the genuine
// "no native module" / "no native config" path (Expo Go, a build missing
// google-services.json/GoogleService-Info.plist) - that's correct
// fallback behaviour, not a stub, and the server's own verifyAppCheck
// middleware is what actually rejects the resulting unauthenticated
// request. A bare `return '';` as the WHOLE function body (no other
// statement before it) is the actual stub signature; real attestation
// calls (initializeAppCheck/getToken) are the positive evidence that
// matters here.
const appCheckIsBareStub = /export\s+async\s+function\s+getAppCheckToken\s*\([^)]*\)[^{]*\{\s*return\s*['"]{2}\s*;\s*\}/.test(appCheckSource);
check('Native App Check implemented',
  !appCheckIsBareStub &&
    /initializeAppCheck/.test(appCheckSource) &&
    /getToken/.test(appCheckSource) &&
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
const knownProductionApiOrigin = 'https://blaze-break-220686314556.europe-west2.run.app';
check('Staging API is not known production service',
  target !== 'staging' || (validBase && base.origin !== knownProductionApiOrigin),
  'Never point staging native builds at the known live Cloud Run service');

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
