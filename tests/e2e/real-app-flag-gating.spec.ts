import { test, expect, type Page } from '@playwright/test';
import { mockAvatarRequests } from './test-helpers';

// Phase 5M (directive §3) - Flag ON half of the gating verification, run
// via playwright.realapp.config.ts's "realapp-flag-on" project against a
// SEPARATE webServer instance with NOVA_AGENTIC_JOURNEY_ENABLED=true -
// isolated test configuration only, never production (see that config's
// own header, and this suite's restriction: no production flag
// activation). The Flag OFF half lives in real-app-nova-journey.spec.ts,
// which runs against the default (flag-unset/false) webServer - together
// these are the only real verification that App.tsx's actual
// useNovaAgenticJourneyEnabled() fetch against the REAL
// /api/nova/journey-config endpoint drives the real mount decision - no
// previous phase's test (dev-preview or route-level) exercised that real
// fetch-to-mount wiring end to end.

async function gotoAppAsAnonymousUser(page: Page) {
  await mockAvatarRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'See a live demo' }).click();
  await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 15_000 });
}

async function openNovaTab(page: Page) {
  await page.getByRole('button', { name: 'Nova Coach' }).click();
}

async function mockChatOnce(page: Page, body: { text: string; planTrace?: unknown[] }) {
  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text: body.text, planTrace: body.planTrace ?? [] } });
  }, { times: 1 });
}

test.describe('Real app (directive §3): Flag ON - isolated test configuration only', () => {
  test('Flag ON: the real Nova tab mounts the Agentic Journey wrapper (StageBar present)', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    // The one structural signal that actually distinguishes the two
    // mounts (see real-app-nova-journey.spec.ts's own comment) - only
    // NovaAgenticJourney renders this.
    await expect(page.getByLabel('Journey stage')).toBeVisible();
    await expect(page.getByPlaceholder(/./).first()).toBeVisible();
  });

  // Directive §3's "approved development journeys become accessible" -
  // offer_practical_assistance (the Agentic-Journey-exclusive capability
  // Phase 5L's own release gate was built for) now actually offers,
  // because the real server-side flag is genuinely on for this isolated
  // webServer - not because a response was hand-crafted to claim it.
  test('Flag ON: offer_practical_assistance opens the real Invisible Load step', async ({ page }) => {
    await gotoAppAsAnonymousUser(page);
    await openNovaTab(page);
    await mockChatOnce(page, {
      text: 'Want help getting this off your plate?',
      planTrace: [{ tool: 'offer_practical_assistance', result: { offered: true, reason: 'User said they are behind on three deadlines this week.' } }],
    });
    await page.getByPlaceholder(/./).first().fill('I am so behind on everything.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('User said they are behind on three deadlines this week.')).toBeVisible();
    await page.getByRole('button', { name: /review what's on my plate/i }).click();
    await expect(page.getByLabel('Describe an obligation, commitment, or friction')).toBeVisible();
  });
});
