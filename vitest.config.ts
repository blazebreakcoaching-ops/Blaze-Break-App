import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // The one true source of TEST_MODE for every test file - not each
    // file's own `process.env.TEST_MODE = 'true'` line. ES module `import`
    // declarations are hoisted above all other top-level code regardless
    // of where they're written, so a file's own assignment (written above
    // `import { app } from './server'` in source) actually runs AFTER that
    // import resolves - meaning server.ts's `if (process.env.TEST_MODE
    // !== 'true') app.listen(...)` guard sees it as unset the first time
    // any such file is the first to import server.ts in a given worker,
    // and calls app.listen() for real. Vitest runs many test files inside
    // the same OS process (worker threads), so whichever file's import
    // wins that race binds port 3000, and the next one to hit the same gap
    // throws EADDRINUSE - the long-standing, file-varying CI flake. Setting
    // it here runs before any test file's module graph loads at all, so
    // the guard always sees the real value. Each file's own redundant
    // assignment is now harmless and left in place rather than stripped
    // from ~170 files for a cosmetic cleanup unrelated to this fix.
    env: { TEST_MODE: 'true' },
    // functions/ and mobile/ are each a separate project with their own
    // package.json/vitest.config.ts/npm test (see functions/package.json
    // and mobile/package.json) - and mobile/tsconfig.json extends
    // expo/tsconfig.base, a package that only exists under mobile/'s own
    // node_modules, never installed by this root project's `npm install`.
    // Without this exclude, vitest's oxc transform fails outright trying
    // to resolve that tsconfig for any mobile/**/*.test.ts file.
    exclude: ['node_modules/**', 'dist/**', 'functions/**', 'mobile/**'],
  },
});
