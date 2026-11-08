import { test, expect } from '@playwright/test';
import { mockAvatarRequests } from './test-helpers';

// Batch 7 multilingual layout checks on the real app: right-to-left for
// Arabic and Urdu, long German/Polish/Spanish labels, non-Latin scripts,
// light and dark, 320px to desktop. No horizontal overflow; every mobile
// bar item fits on screen; html lang/dir set for screen readers.

const OUT = process.env.SHOT_DIR;
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const CASES: Array<{ lang: string; width: number; scheme: 'light' | 'dark' }> = [
  { lang: 'ar', width: 1280, scheme: 'light' }, { lang: 'ar', width: 390, scheme: 'dark' },
  { lang: 'ur', width: 375, scheme: 'light' }, { lang: 'de', width: 1280, scheme: 'dark' },
  { lang: 'de', width: 320, scheme: 'light' }, { lang: 'hi', width: 390, scheme: 'light' },
  { lang: 'zh', width: 1280, scheme: 'light' }, { lang: 'bn', width: 375, scheme: 'dark' },
  { lang: 'pl', width: 768, scheme: 'light' }, { lang: 'es', width: 320, scheme: 'dark' }, { lang: 'fr', width: 375, scheme: 'light' }, { lang: 'nl', width: 390, scheme: 'dark' }, { lang: 'pt', width: 320, scheme: 'light' },
];

for (const c of CASES) {
  test(`${c.lang} ${c.width} ${c.scheme}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript((lang) => window.localStorage.setItem('blaze_ui_locale', lang), c.lang);
    await page.setViewportSize({ width: c.width, height: c.width >= 1024 ? 900 : 760 });
    await page.emulateMedia({ colorScheme: c.scheme, reducedMotion: 'reduce' });
    await mockAvatarRequests(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Prefer to look around first? View a demo' }).click();
    await page.waitForTimeout(6000);
    await page.addStyleTag({ content: FREEZE });
    for (let i = 0; i < 6; i++) {
      for (const name of ['Close feedback dialog', 'Got it', "I'll explore on my own", 'Not now']) {
        const b = page.getByRole('button', { name });
        if (await b.isVisible().catch(() => false)) await b.click({ force: true, timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(300);
    }
    const html = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
    expect(html.lang.split('-')[0]).toBe(c.lang);
    expect(html.dir).toBe(c.lang === 'ar' || c.lang === 'ur' ? 'rtl' : 'ltr');
    // Nothing may overflow the viewport horizontally (RTL or long labels).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (OUT) await page.screenshot({ path: `${OUT}/${c.lang}-${c.width}-${c.scheme}.png` });
    const bar = page.getByTestId('mobile-bottom-nav');
    if (c.width < 1024 && await bar.isVisible()) {
      const box = await bar.boundingBox();
      // Every bar item fits inside the screen.
      for (const b of await bar.getByRole('button').all()) {
        const r = await b.boundingBox();
        if (r) { expect(r.x).toBeGreaterThanOrEqual(-1); expect(r.x + r.width).toBeLessThanOrEqual(c.width + 1); }
      }
      expect(box).toBeTruthy();
      // Labels are text, not raw keys, in the chosen language.
      await expect(bar).not.toContainText('nav.');
    }
  });
}
