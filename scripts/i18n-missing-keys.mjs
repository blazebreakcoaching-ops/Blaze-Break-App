#!/usr/bin/env node
// Missing-key detector: reports, per language, keys missing from or empty in
// its pack compared with the English source (i18n/en.ts). Exits non-zero when
// any pack is incomplete. Usage: npx tsx scripts/i18n-missing-keys.mjs
const { SUPPORTED_LOCALES, missingKeys, coverage } = await import('../i18n/index.ts');
let incomplete = 0;
for (const l of SUPPORTED_LOCALES) {
  const c = coverage(l.code);
  const missing = missingKeys(l.code);
  if (missing.length) incomplete++;
  console.log(`${l.code.padEnd(3)} ${l.englishName.padEnd(30)} ${String(c.translated).padStart(4)}/${c.total} (${c.percent}%) ${l.status}${missing.length ? '  MISSING: ' + missing.join(', ') : ''}`);
}
process.exit(incomplete ? 1 : 0);
