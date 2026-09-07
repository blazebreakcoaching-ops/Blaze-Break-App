import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  STRAY_USER_COLLECTIONS,
  NON_PERSONAL_USERID_COLLECTIONS,
  collectionsForExport,
  collectionsForErasure,
} from './user-data-collections';

// The point of this suite is the guardrail test at the bottom: it reads
// server.ts and fails if a top-level collection queried by a userId field
// is not classified in user-data-collections.ts. That's what stops the
// next feature from silently reintroducing the export/erasure gap that
// anxiety_reset_events and audit_logs each had.

// Finds every top-level collection (one hanging off `db`/`getDb()`, not off
// a userRef or a .doc(...) chain) that is filtered by a `userId` field.
// Those are exactly the collections listCollections()/recursiveDelete()
// cannot reach, so each one must be consciously classified.
function findTopLevelUserIdCollections(src: string): string[] {
  const found = new Set<string>();
  const whereRe = /\.where\(\s*["']userId["']/g;
  let w: RegExpExecArray | null;
  while ((w = whereRe.exec(src)) !== null) {
    const upto = src.slice(0, w.index);
    const collections = [...upto.matchAll(/\.collection\(\s*["']([a-zA-Z_]+)["']\s*\)/g)];
    if (collections.length === 0) continue;
    const last = collections[collections.length - 1];
    const name = last[1];
    // Look at the ~40 chars before this .collection call to see what it was
    // called on. Only a call on the top-level db is a stray collection; a
    // call on a userRef or a .doc(uid) chain is a subcollection that the
    // dynamic enumeration already covers.
    const pre = upto.slice(Math.max(0, (last.index ?? 0) - 40), last.index);
    const isTopLevel = /\bdb\s*$/.test(pre) || /getDb\(\)\s*$/.test(pre);
    if (isTopLevel) found.add(name);
  }
  return [...found].sort();
}

describe('user-data-collections registry', () => {
  it('collectionsForExport includes every declared personal collection', () => {
    expect(collectionsForExport()).toContain('anxiety_reset_events');
    expect(collectionsForExport()).toContain('audit_logs');
  });

  it('collectionsForErasure excludes audit_logs (a compliance trail must outlive the account)', () => {
    expect(collectionsForErasure()).toContain('anxiety_reset_events');
    expect(collectionsForErasure()).not.toContain('audit_logs');
  });

  it('erasure is a subset of export - nothing is erased that would not also be exported', () => {
    const exported = new Set(collectionsForExport());
    for (const name of collectionsForErasure()) {
      expect(exported.has(name)).toBe(true);
    }
  });

  it('every collection carrying an eraseOnDeletion=false has a documented reason', () => {
    for (const c of STRAY_USER_COLLECTIONS) {
      if (!c.eraseOnDeletion) {
        expect(c.reason, `${c.name} skips erasure and must explain why`).toBeTruthy();
      }
    }
  });

  it('no collection is listed as both personal (stray) and structurally exempt', () => {
    const stray = new Set(STRAY_USER_COLLECTIONS.map((c) => c.name));
    for (const name of NON_PERSONAL_USERID_COLLECTIONS) {
      expect(stray.has(name), `${name} is in both lists`).toBe(false);
    }
  });
});

describe('GUARDRAIL: server.ts top-level userId-keyed collections are all classified', () => {
  it('every top-level collection queried by userId is either a declared personal collection or an explicit exemption', () => {
    const src = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
    const discovered = findTopLevelUserIdCollections(src);

    // Sanity check the scanner still works - if this ever finds nothing,
    // the regex has drifted and the guardrail is silently disabled.
    expect(discovered.length).toBeGreaterThan(0);

    const classified = new Set<string>([
      ...STRAY_USER_COLLECTIONS.map((c) => c.name),
      ...NON_PERSONAL_USERID_COLLECTIONS,
    ]);

    const unclassified = discovered.filter((name) => !classified.has(name));
    expect(
      unclassified,
      `Found top-level collection(s) queried by userId that are not classified in ` +
        `user-data-collections.ts: [${unclassified.join(', ')}]. Add each to ` +
        `STRAY_USER_COLLECTIONS (if it holds the user's personal data - decide export/erasure) ` +
        `or NON_PERSONAL_USERID_COLLECTIONS (if it is shared/structural), so the GDPR ` +
        `export and deletion endpoints stay complete.`,
    ).toEqual([]);
  });

  it('the two collections we already fixed are still detected by the scanner', () => {
    const src = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
    const discovered = findTopLevelUserIdCollections(src);
    expect(discovered).toContain('anxiety_reset_events');
    expect(discovered).toContain('audit_logs');
  });
});
