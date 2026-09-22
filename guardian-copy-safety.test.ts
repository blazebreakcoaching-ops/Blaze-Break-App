import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// docs/GUARDIAN_SUPPORT_SPEC.md §E.7 point 4: "A test asserts that every
// user-facing string claiming an action ('we will contact', 'automatically
// notify') is reachable only under a flag whose capability is registered.
// This test fails the build otherwise." §E.7 point 1 calls this "copy is
// bound to flag state."
//
// This app has no rendered-component test harness (no jsdom/testing-library
// dependency anywhere in this repo) - rather than pull one in for a single
// check, this walks the real TypeScript AST of the two files that render
// Guardian-alert-claiming copy (NovaGuardianRelay.tsx, CrisisSupport.tsx)
// and proves each capability-claiming string sits inside a JSX branch whose
// condition references `alertsEnabled` - the client-side read of
// guardian-alert.ts's guardianAlertsEnabled() via
// src/lib/useGuardianAlertsEnabled.ts. It's a static source check, not a
// rendered-DOM one, but it directly answers the spec's question for the
// two real call sites: is this copy reachable outside the gated branch.
//
// If a future change adds new capability-claiming copy to either file, add
// it to CAPABILITY_CLAIMING_STRINGS below and gate its JSX branch on
// `alertsEnabled` - this test will fail loudly otherwise, which is the
// point: the old failure mode was copy promising a capability silently,
// with nothing to catch it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CAPABILITY_CLAIMING_STRINGS: { file: string; text: string }[] = [
  { file: 'src/components/NovaGuardianRelay.tsx', text: 'One-Touch Alert' },
  { file: 'src/components/NovaGuardianRelay.tsx', text: 'Manual SOS' },
  { file: 'src/components/CrisisSupport.tsx', text: 'Sends a text asking them to call you right now' },
  // Guardian Support Invitation's own review sheet - reuses the same send
  // capability, so its own "Send it now" claim needs the same gate. Call,
  // copy, and "open my messaging app" are deliberately NOT in this list:
  // they hand off to the device's own dialer/clipboard/SMS app rather than
  // this product's Twilio pipeline, so alertsEnabled has no bearing on them.
  { file: 'src/components/GuardianConfirmSheet.tsx', text: 'Send it now' },
];

const conditionMentionsAlertsEnabled = (node: ts.Node): boolean => {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isConditionalExpression(current) && current.condition.getText().includes('alertsEnabled')) {
      return true;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      current.left.getText().includes('alertsEnabled')
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const findMatchingNodes = (sourceFile: ts.SourceFile, text: string): ts.Node[] => {
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxText(node) || ts.isStringLiteral(node)) && node.getText().includes(text)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
};

describe('Guardian alert capability-claiming copy is gated by alertsEnabled (§E.7 point 4)', () => {
  for (const { file, text } of CAPABILITY_CLAIMING_STRINGS) {
    it(`"${text}" in ${file} only renders inside an alertsEnabled-gated branch`, () => {
      const fullPath = path.join(__dirname, file);
      const source = readFileSync(fullPath, 'utf8');
      const sourceFile = ts.createSourceFile(fullPath, source, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TSX);

      const matches = findMatchingNodes(sourceFile, text);
      // The string must actually still exist - a rename/removal that also
      // deleted this assertion's target should fail loudly, not silently
      // report "trivially gated" over zero matches.
      expect(matches.length).toBeGreaterThan(0);
      for (const node of matches) {
        expect(conditionMentionsAlertsEnabled(node)).toBe(true);
      }
    });
  }
});
