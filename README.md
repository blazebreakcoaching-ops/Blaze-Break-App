# Blaze Break

Burnout recovery coaching app for individuals, teams, and organisations.
A React + Vite frontend backed by a real Express server (`server.ts`),
Firebase/Firestore, and Nova - an AI coach with real tool use, memory,
and (feature-flagged) support for multiple LLM providers.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install --legacy-peer-deps`
2. Set `GEMINI_API_KEY` in `.env.local` - see `docs/NOVA_ENV_VARS.md`
   for every other environment variable Nova's provider system reads,
   what each one does, and what it depends on.
3. Run the app:
   `npm run dev`

## Scripts

- `npm run dev` - runs the server (`server.ts`) directly via `tsx`
- `npm run build` - real production build: the Vite frontend bundle,
  plus an esbuild bundle of the backend into `dist/server.cjs`
- `npm start` - runs the built backend (`dist/server.cjs`)
- `npm run lint` - type-checks the whole project (`tsc --noEmit`)
- `npm test` - runs the test suite (`vitest`)

Eslint isn't wired into an npm script - run it directly:
`npx eslint . --config eslint.cleanup.config.js --ignore-pattern app/`

## CI

`.github/workflows/ci.yml` runs type-check, lint, build, and test on
every push and pull request - the same checks above, enforced
automatically rather than left to whoever's committing to remember.

## Structure, briefly

- `server.ts` - the real backend: auth, Firestore access, Nova's chat/
  tool-use/voice endpoints, org dashboard aggregation, Twilio, and more
- `src/App.tsx` - the main frontend shell and most top-level screens
- `src/components/` - individual features and screens
- `nova-tools.ts` / `org-risk-trend.ts` - pure, unit-tested logic kept
  separate from server.ts so it's testable without live Firestore
- `firestore.rules` - real, field-validated security rules (not just
  auth checks) for the collections the client can read/write directly
- `app/` - a separate set of older utility scripts, intentionally
  excluded from type-checking and linting (see `tsconfig.json`'s
  `exclude` and the CI workflow's `--ignore-pattern`) - not part of
  the deployed application
