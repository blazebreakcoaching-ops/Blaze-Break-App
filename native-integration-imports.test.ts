import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The 2026-11-03 web/native integration introduced two imports of the
 * same hook in the Expo root layout, which breaks the native TypeScript
 * parser even though all previous native-hardening tests were green.
 *
 * This source guard is deliberately cheap and runs in the ROOT test suite;
 * physical iOS/Android build verification is still required separately.
 */
describe('Expo root integration import safety', () => {
  it('imports NativeThemeProvider and useNativeTheme exactly once', () => {
    const source = readFileSync('mobile/app/_layout.tsx', 'utf8');
    const imports = [...source.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/src\/lib\/native-theme['"]/g)];
    expect(imports).toHaveLength(1);
    const names = imports.flatMap(match => match[1].split(',').map(s => s.trim()));
    expect(names).toContain('NativeThemeProvider');
    expect(names).toContain('useNativeTheme');
    expect(names.filter(name => name === 'useNativeTheme')).toHaveLength(1);
  });
});
