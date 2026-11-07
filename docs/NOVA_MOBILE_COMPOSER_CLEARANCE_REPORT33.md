# CTO Report 33 follow-up — Nova mobile send-button clearance

Date: 3 November 2026  
Base release-candidate commit: `d1b03c1`  
Branch: `cto/nova-mobile-composer-clearance-20261103`  
Status: code and regression assertion pushed; **no full browser, Expo, or release-gate test executed in the GitHub-only editing environment.**

## Problem (from CTO Report 33)
On Pixel 7, Nova's Send button had bottom y=777.5px while the fixed mobile navigation began at y=766px — an 11.5px overlap that occasionally intercepted clicks. The `h-full` chat panel did not have a height-bounded ancestor; its message list therefore could not use internal flex scrolling to protect the composer.

## Changes
- `src/App.tsx`: scope a new `ember-nova-tab` class to the actual Nova tab; mark the existing bottom nav with `data-testid="mobile-bottom-nav"` for a geometry assertion. **No navigation handlers, visual branding, or feature gates changed.**
- `src/index.css`: on widths below 768px, constrain the actual Nova chat panel (`.ember-nova-tab .ember-nova-room`) to a viewport-relative block-size, accounting for safe-area bottom inset. Allow the `role=log` flex child to shrink and scroll internally while keeping the input row unshrunk. Desktop layout and chat mounts outside this app tab remain untouched.
- `tests/e2e/real-app-nova-journey.spec.ts`: inside the existing real Nova chat integration test, assert that at mobile viewport widths the Send button's lower edge is at least 8px above the mobile navigation's upper edge. Then send a real test message using the existing handler. **No tests removed, skipped, retried, or forced.**

## Verification required before integration
1. Fetch this branch and read `CLAUDE.md` and `docs/EMBER_DESIGN_LOCK.md`.
2. `npm ci`, `npx tsc --noEmit`, `npx eslint . --config eslint.cleanup.config.js`, `npm run build`, `npx vitest run`, `npm run lint:mobile`, and native TS/Jest checks.
3. Run `npm run test:e2e:realapp` at the actual Pixel 7 preset. Inspect the new geometry assertion and confirm Send is tappable after fresh login, after at least one message, and with the keyboard visible where supported.
4. Visually inspect Nova on **320px, 390px, Pixel 7, tablet and desktop**, both themes. Check safe-area, short-height viewport, expanding messages and panel internal scrolling. Ensure no chat controls or NovaAgenticJourney tools are cropped.
5. Run `npm run verify:release:offline -- --all` and report every passing/failing stage, including any D-Bus/browser-environment failures; **do not claim a green gate until actually green**.
6. Assess the mobile dependency audit findings (12 high, 1 critical in Report 33); determine affected dependencies, runtime reachability and upgrade impact before any native release.
7. PR #140 remains an owner release decision. **Do not merge into main or deploy until explicitly approved**.

If mobile geometry still fails, adjust the viewport-relative height against real screen measurements rather than suppressing the assertion or force-clicking through the fixed nav.

No authenticated deployment or production action performed by ChatGPT.
