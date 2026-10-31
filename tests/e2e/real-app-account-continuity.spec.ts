import { test, expect, type Page, type Locator } from '@playwright/test';
import { mockAvatarRequests } from './test-helpers';

// Phase 5N (directive §3/§4) - the real, registered-account experience and
// the account-isolation guarantees this phase exists to verify, driven
// through the REAL App.tsx/LandingPage/SituationalOnboarding components via
// real navigation (never by setting React state directly or skipping steps).
// Runs against playwright.realapp.config.ts's "realapp-desktop"/"realapp-mobile"
// projects (flag-off webServer, local Auth+Firestore emulators) - see that
// config's own header for the full architecture. Only /api/nova/chat is
// mocked per-test, per the directive's "mocked model responses" instruction;
// every account created here is a synthetic, emulator-only identity, never a
// real person's data.

function uniqueEmail(label: string): string {
  return `phase5n-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

const PASSWORD = 'Ph5N-Synthetic-Pass-1!';

async function mockChatOnce(page: Page, text: string) {
  await page.route('**/api/nova/chat', async (route) => {
    await route.fulfill({ json: { text, planTrace: [] } });
  }, { times: 1 });
}

async function dismissFeedbackModalIfOpen(page: Page) {
  // NovaFeedbackModal.tsx's own cooldown key is now UID-scoped (Phase 5N
  // §1/§2's novaStorageKey - see src/lib/nova-chat-storage.ts), so it can
  // no longer be pre-seeded from an initScript before any identity exists.
  // This phase's own §6 fix means the modal's timer only arms (and then
  // waits a further 3s) once a real auth state resolves, so across a
  // multi-identity test it can legitimately open once per identity -
  // exactly when depends on this environment's own auth-emulator latency,
  // which varies run to run. clickRobustly() below is the real guard
  // against that; this is just a best-effort early dismissal.
  const closeButton = page.getByRole('button', { name: 'Close feedback dialog' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click().catch(() => {});
  }
}

async function dismissAnyOpenModal(page: Page) {
  // Same real dialogs as dismissFeedbackModalIfOpen/dismissPostOnboardingModals
  // (NovaFeedbackModal, WhatsNewModal, the onboarding-completion "Welcome"
  // card, Daily Check-In) collected into one sweep, each closed with its
  // own real button - used by clickRobustly() as the retry's recovery step
  // whenever any of them is the thing actually intercepting a click.
  const simpleButtons = ['Close feedback dialog', 'Got it', "I'll explore on my own"];
  for (const name of simpleButtons) {
    const loc = page.getByRole('button', { name });
    if (await loc.isVisible().catch(() => false)) {
      // A short per-click timeout - never the 30s default - so a single
      // stale reference (the element detaching mid-AnimatePresence-exit
      // right as this runs) can't stall the whole sweep; the next sweep
      // iteration or clickRobustly() retry picks it up if it's still there.
      await loc.click({ force: true, timeout: 2_000 }).catch(() => {});
    }
  }
  const dailyCheckInClose = page.getByRole('dialog').filter({ hasText: 'Daily Check-In' }).getByRole('button', { name: 'Close' });
  if (await dailyCheckInClose.isVisible().catch(() => false)) {
    await dailyCheckInClose.click({ force: true, timeout: 2_000 }).catch(() => {});
  }
}

async function clickRobustly(page: Page, locator: Locator, attempts = 5) {
  // Phase 5N finding: against this environment's local Auth emulator, the
  // delay before a real auth state resolves is unpredictable run to run,
  // which means WhatsNewModal/NovaFeedbackModal/the onboarding-completion
  // card can pop up and intercept a click at any point, not just right
  // after landing. Retrying the click itself - dismissing whatever
  // actually got in the way, then trying again - is robust to exactly
  // when that happens, instead of guessing a fixed wait.
  for (let i = 0; i < attempts - 1; i++) {
    try {
      await locator.click({ timeout: 4_000 });
      return;
    } catch {
      await dismissAnyOpenModal(page);
    }
  }
  await locator.click();
}

async function startAnonymousDemo(page: Page) {
  await mockAvatarRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'See a live demo' }).click();
  await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 25_000 });
  // WhatsNewModal.tsx mounts for ANY signed-in Firebase identity (App.tsx
  // gates it on plain `user`, anonymous included - unlike NovaFeedbackModal,
  // which is guest-only), so a brand-new anonymous demo session with no
  // lastSeenChangelogVersion yet sees it too, sharing NovaFeedbackModal's
  // own z-[100] full-screen wrapper class and blocking the exact same
  // clicks if left open.
  await dismissPostOnboardingModals(page);
  await dismissFeedbackModalIfOpen(page);
}

async function openSignUpModal(page: Page) {
  // The real in-app path from an anonymous/demo session to the real
  // sign-up form: AccountStatusBanner's "Sign up free" CTA (App.tsx wires
  // this to open LandingPage's auth modal already in signup mode) - not a
  // direct URL or state manipulation. The banner only renders for a demo
  // session, so it's reachable right after startAnonymousDemo().
  await clickRobustly(page, page.getByRole('button', { name: 'Sign up free' }));
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible({ timeout: 10_000 });
}

async function submitRealSignUp(page: Page, email: string) {
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByPlaceholder('Confirm password').fill(PASSWORD);
  // Not getByRole('button', { name: 'Create account' }) - the button's
  // visible label lives inside a nested role="status"/aria-live span (so
  // the submit state can be announced to screen readers), and that live
  // region is excluded from the button's own computed accessible name,
  // leaving it effectively nameless for a role+name query. The real CSS
  // selector below is what every real user's click actually lands on.
  await page.locator('[role="dialog"] button[type="submit"]').click();
  // Optional post-signup 2FA step - always skipped here (synthetic test
  // identities never need a real second factor), the same real "Skip for
  // now" escape hatch a genuine user would click.
  await expect(page.getByRole('heading', { name: 'Secure your account' })).toBeVisible({ timeout: 25_000 });
  await page.getByRole('button', { name: 'Skip for now' }).click();
}

async function submitRealSignIn(page: Page, email: string) {
  // The same legal-agreement checkbox gates the submit button in BOTH
  // auth modes (LandingPage.tsx's own disabled={emailAuthSubmitting ||
  // !legalAgreed} applies to sign-in and sign-up alike) - easy to miss
  // since only the sign-up form shows it with real content underneath to
  // agree to, but a returning sign-in needs it checked too.
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.locator('[role="dialog"] button[type="submit"]').click();
}

async function completeRealOnboarding(page: Page, fullName: string) {
  // Drives the real SituationalOnboarding wizard end to end via its own
  // real buttons - never by calling onComplete() or setting profile state
  // directly. Steps 1-4 (welcome/pathway/pressure/nova_tone) auto-advance
  // ~400ms after an option is clicked (SituationalOnboarding.tsx's own
  // handleSelect); consent has no required input, just "Continue"; profile
  // requires a name before "Get started" is enabled.
  await expect(page.getByText("Welcome. Let's take this one step at a time.")).toBeVisible({ timeout: 25_000 });
  await page.getByRole('button', { name: /I need to restore my energy/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('A bit about your work')).toBeVisible();
  await page.getByRole('button', { name: 'Individual Contributor' }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText("What's weighing on you")).toBeVisible();
  await page.getByRole('button', { name: /Workload and deadlines/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('How Nova should talk to you')).toBeVisible();
  await page.getByRole('button', { name: /Direct & Analytical/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('Your privacy')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Just a few details')).toBeVisible();
  await page.getByLabel('Full Name / Alias').fill(fullName);
  await page.getByRole('button', { name: 'Get started' }).click();

  await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 25_000 });
  await dismissPostOnboardingModals(page);
  await dismissFeedbackModalIfOpen(page);
}

async function dismissPostOnboardingModals(page: Page) {
  // A brand-new real account's very first landing on the dashboard stacks
  // up to three real, legitimate dialogs on top of each other - the
  // "Welcome, <name>." onboarding-completion card, "What's New", and the
  // Daily Check-In prompt - all real UI a genuine new user would also see
  // and have to dismiss before they could click anything else underneath.
  // Each is independently optional (none of this phase's work depends on
  // which ones appear), so this only closes whichever are actually open.
  //
  // Phase 5N finding (§6-adjacent, noted in the delivery report rather than
  // fixed here - a z-index/stacking issue, not an account-privacy one,
  // outside this phase's bounded scope): with all three mounted at once,
  // the Daily Check-In dialog's own backdrop (an "absolute inset-0" layer
  // scoped inside <main>, not a top-level "fixed" overlay) can visually
  // sit OVER the Welcome modal's buttons despite the Welcome modal's own
  // z-[110] - a real user would still see and could still click through
  // this (browsers resolve the actual hit-test correctly; Playwright's
  // stricter actionability check is what flags the overlap), so `force`
  // here reproduces a real click without that stricter check blocking it.
  // dismissAnyOpenModal already wraps each individual click in .catch(), so
  // a single flaky/stale element (an AnimatePresence exit mid-render) can
  // never hang this loop - it just tries again next iteration.
  for (let i = 0; i < 4; i++) {
    await dismissAnyOpenModal(page);
    await page.waitForTimeout(150);
  }
}

async function openNovaTab(page: Page) {
  await clickRobustly(page, page.getByRole('button', { name: 'Nova Coach' }));
}

async function sendNovaMessage(page: Page, userText: string, replyText: string) {
  await mockChatOnce(page, replyText);
  await page.getByPlaceholder(/./).first().fill(userText);
  await clickRobustly(page, page.getByRole('button', { name: 'Send message' }));
  await expect(page.getByText(replyText)).toBeVisible({ timeout: 10_000 });
}

async function signOut(page: Page) {
  // The real "Not you? Sign out" / Settings sign-out path. SettingsModal
  // exposes the real sign-out action; opened via the real gear/settings
  // entry point rather than calling logOut() from the test.
  await clickRobustly(page, page.getByRole('button', { name: /settings/i }).first());
  await clickRobustly(page, page.getByRole('button', { name: /sign out/i }));
}

test.describe('Real app (Phase 5N directive §3): registration and onboarding journey', () => {
  test('a real account can register, complete onboarding, use Nova, sign out, and sign back in to the same conversation', async ({ page }) => {
    // This journey runs a full signup + onboarding + Nova exchange + sign
    // out + sign back in against this environment's own local Auth
    // emulator, whose latency varies run to run (see clickRobustly's own
    // comment) - the default 30s budget is sometimes too tight for all of
    // that in one test, independent of anything this phase's own code
    // changed.
    test.setTimeout(75_000);
    const email = uniqueEmail('journey');

    await startAnonymousDemo(page);
    await openSignUpModal(page);
    await submitRealSignUp(page, email);
    await completeRealOnboarding(page, 'Jordan Rivers');

    await openNovaTab(page);
    await sendNovaMessage(page, 'This week has been relentless.', 'I hear you - let\'s look at what\'s driving that.');

    // Real recovery-tool navigation (directive's own "recovery-tool
    // navigation" step), then back to Nova - the real tab system, not a
    // synthetic onNavigate call. The sidebar groups tabs under collapsible
    // section buttons ("Recovery Tools" etc.) - Recover is the individual
    // tab inside that group, so the group opens first, same as a real user.
    await clickRobustly(page, page.getByRole('button', { name: 'Recovery Tools' }));
    await clickRobustly(page, page.getByRole('button', { name: 'Recover', exact: true }));
    await expect(page.getByRole('button', { name: 'Recover', exact: true })).toHaveAttribute('aria-current', 'page');
    await openNovaTab(page);
    await expect(page.getByText('This week has been relentless.')).toBeVisible();

    await signOut(page);
    await expect(page.getByRole('button', { name: /sign in|access account/i }).first()).toBeVisible({ timeout: 25_000 });

    // Real sign-in, same account - the real "Access Account" modal this
    // time in signin mode (its default), not the signup path again.
    await clickRobustly(page, page.getByRole('button', { name: /access account|sign in/i }).first());
    await submitRealSignIn(page, email);

    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 25_000 });
    await dismissPostOnboardingModals(page);
    await dismissFeedbackModalIfOpen(page);
    await openNovaTab(page);
    await expect(page.getByText('This week has been relentless.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('I hear you - let\'s look at what\'s driving that.')).toBeVisible();
  });
});

test.describe('Real app (Phase 5N directive §4): shared-device and account-switching privacy', () => {
  test('registered account A signing out, then registered account B signing in on the same browser, never sees account A\'s Nova conversation', async ({ page }) => {
    // Two full signup+onboarding cycles plus a sign-out against this
    // environment's own local Auth emulator - see the journey test's own
    // comment on why the default 30s budget is sometimes too tight here.
    test.setTimeout(90_000);
    const emailA = uniqueEmail('acct-a');
    const emailB = uniqueEmail('acct-b');
    const secretA = 'Account A\'s private burnout disclosure, never for account B.';

    await startAnonymousDemo(page);
    await openSignUpModal(page);
    await submitRealSignUp(page, emailA);
    await completeRealOnboarding(page, 'Account A');
    await openNovaTab(page);
    await sendNovaMessage(page, secretA, 'Noted, just for you.');

    await signOut(page);
    await expect(page.getByRole('button', { name: /sign in|access account/i }).first()).toBeVisible({ timeout: 25_000 });

    // A brand-new anonymous session starts here (auth.tsx auto-signs-in any
    // fresh visitor) before account B registers - same shared-browser
    // scenario as a real kiosk/shared-device handoff.
    await clickRobustly(page, page.getByRole('button', { name: /access account|sign in/i }).first());
    await clickRobustly(page, page.getByRole('button', { name: /don't have an account\? sign up/i }));
    await submitRealSignUp(page, emailB);
    await completeRealOnboarding(page, 'Account B');

    await openNovaTab(page);
    // Account B's Nova history must be empty - no trace of account A's
    // disclosure, rating, or feedback should be readable from this UI.
    await expect(page.getByText(secretA)).toHaveCount(0);
    await expect(page.getByText('Noted, just for you.')).toHaveCount(0);

    await sendNovaMessage(page, 'Account B message, unrelated to A.', 'Got it - this is account B\'s own thread.');
    await expect(page.getByText(secretA)).toHaveCount(0);
  });

  test('registered account A signing out, then a fresh anonymous visitor on the same browser, never sees account A\'s Nova conversation', async ({ page }) => {
    const emailA = uniqueEmail('acct-solo');
    const secretA = 'Account A\'s second private disclosure for the anonymous-visitor case.';

    await startAnonymousDemo(page);
    await openSignUpModal(page);
    await submitRealSignUp(page, emailA);
    await completeRealOnboarding(page, 'Solo Account');
    await openNovaTab(page);
    await sendNovaMessage(page, secretA, 'Logged for the account only.');

    await signOut(page);
    await expect(page.getByRole('button', { name: 'See a live demo' })).toBeVisible({ timeout: 25_000 });

    // A fresh anonymous visitor - the real "See a live demo" path, a new
    // Firebase anonymous uid, never account A's.
    await clickRobustly(page, page.getByRole('button', { name: 'See a live demo' }));
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toBeVisible({ timeout: 25_000 });
    await dismissAnyOpenModal(page);
    await openNovaTab(page);
    await expect(page.getByText(secretA)).toHaveCount(0);
    await expect(page.getByText('Logged for the account only.')).toHaveCount(0);
  });

  test('an anonymous demo session converting to a real account keeps its own conversation (same Firebase identity, not a leak)', async ({ page }) => {
    const email = uniqueEmail('conversion');
    const demoMessage = 'Message sent while still anonymous, before registering.';

    await startAnonymousDemo(page);
    await openNovaTab(page);
    await sendNovaMessage(page, demoMessage, 'Anonymous reply, before signup.');

    await openSignUpModal(page);
    await submitRealSignUp(page, email);
    await completeRealOnboarding(page, 'Converted Account');

    await openNovaTab(page);
    // linkWithCredential preserves the same uid through signup, so this is
    // legitimate continuity for the SAME person, not a cross-identity leak.
    await expect(page.getByText(demoMessage)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Anonymous reply, before signup.')).toBeVisible();
  });

  test('a page reload during onboarding does not silently skip onboarding or leak into the app', async ({ page }) => {
    const email = uniqueEmail('reload');

    await startAnonymousDemo(page);
    await openSignUpModal(page);
    await submitRealSignUp(page, email);
    await expect(page.getByText("Welcome. Let's take this one step at a time.")).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: /I need to restore my energy/ }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('A bit about your work')).toBeVisible();

    // App.tsx's `flow` is in-memory only (directive's own documented fact),
    // so a real reload mid-onboarding is expected to land back on a safe,
    // known state - never partway through a form with inconsistent data,
    // and never silently finished into the dashboard without a saved name.
    await page.reload();

    // Real re-entry: this real account has no saved profile yet (onboarding
    // was never completed), so it must not be able to reach the dashboard
    // without actually finishing onboarding again.
    await page.getByRole('button', { name: /access account|sign in/i }).first().click();
    await submitRealSignIn(page, email);

    await expect(page.getByText("Welcome. Let's take this one step at a time.")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: 'Nova Coach' })).toHaveCount(0);
  });
});
