// Phase 5F Agentic Expansion, directive §2: "Use mocked external task
// connectors only. Do not modify real Asana, Monday, Jira or other
// provider tasks." This is a static regression guard, not a behavioural
// test — it proves, by reading source text, that none of the Task
// Deferral files import a real provider SDK, raw network client, or the
// existing read-only integration-token infrastructure. If a future change
// ever adds one of these imports, this test is the trip-wire, the same
// role nova-support-circle-no-auto-contact-audit.test.ts plays for
// Guardian Relay's no-automatic-contact guarantee.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname);

const TASK_DEFERRAL_FILES = [
  'nova-task-deferral-types.ts',
  'nova-task-deferral-connector-contract.ts',
  'nova-task-deferral-service.ts',
].map((f) => path.join(ROOT, f));

// Covers every real way this codebase could reach a provider: a provider
// SDK, raw network primitives, or this app's own OAuth
// integration_tokens/connector-service infrastructure (read-only signal
// routes today, but still a real network/credential path this category
// must never touch).
const REAL_CONNECTOR_PATTERN = /from\s+['"][^'"]*(googleapis|asana|jira-client|node-jira|monday-sdk|@mondaydotcomorg|axios)['"]|require\(\s*['"][^'"]*(googleapis|asana|jira|monday)['"]\s*\)|\bfetch\s*\(|\bhttps?\.request\s*\(|from\s+['"]node:https?['"]|from\s+['"]\.\/(integration-connector-service|oauth-token-refresh)['"]/i;

describe('Nova Task Deferral never imports a real provider connector or network primitive', () => {
  it('found all three known Task Deferral source files (sanity check that the audit still matches reality)', () => {
    const existing = TASK_DEFERRAL_FILES.filter((f) => fs.existsSync(f));
    expect(existing.length).toBe(TASK_DEFERRAL_FILES.length);
  });

  it.each(TASK_DEFERRAL_FILES.map((f) => [path.relative(ROOT, f), f] as const))('%s has no real-connector or raw-network import', (_label, file) => {
    const content = fs.readFileSync(file, 'utf8');
    expect(content).not.toMatch(REAL_CONNECTOR_PATTERN);
  });

  it('the connector contract exports only the mock constructor - no "real"-named export exists to accidentally wire in', () => {
    const content = fs.readFileSync(path.join(ROOT, 'nova-task-deferral-connector-contract.ts'), 'utf8');
    const exportedFunctionNames = [...content.matchAll(/export function (\w+)/g)].map((m) => m[1]);
    expect(exportedFunctionNames).toEqual(['createMockTaskDeferralConnector']);
  });
});
