import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Design-system guard (Ember design lock, "Shared UI": use semantic
// variables, not page-specific hard-coded palettes). Four light/dark text
// colour pairs were copied ~600 times; they are now single semantic
// utilities in src/index.css. This stops the copies creeping back.
// Exception: a class string that also sets a hover/focus/state text
// colour keeps the original pair, so CSS ordering is unchanged there.
const PAIRS: [RegExp, string][] = [
  [/text-\[#9a3412\] dark:text-primary(?![\w/-])/g, 'text-ember-accent'],
  [/text-\[#9a3412\] dark:text-warning(?![\w/-])/g, 'text-ember-warning'],
  [/text-destructive dark:text-\[#f87171\]/g, 'text-ember-danger'],
  [/text-\[#166534\] dark:text-\[#4ade80\]/g, 'text-ember-success'],
];
const STATE_TEXT = /(hover|focus|group-hover|active|disabled|aria-[a-z]+|data-\[[^\]]+\]|dark:hover):text-/;

const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []);

describe('Ember semantic text colours', () => {
  it('the four semantic utilities are defined once in index.css', () => {
    const css = fs.readFileSync('src/index.css', 'utf8');
    for (const [, name] of PAIRS) expect(css.match(new RegExp(`@utility ${name} \\{`, 'g'))).toHaveLength(1);
  });

  it('components use the semantic classes instead of re-copying the hard-coded pairs', () => {
    const offenders: string[] = [];
    for (const file of files('src')) {
      const source = fs.readFileSync(file, 'utf8');
      for (const str of source.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) || []) {
        if (STATE_TEXT.test(str)) continue;
        for (const [re, name] of PAIRS) {
          if (str.match(re)) offenders.push(`${file}: use ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
