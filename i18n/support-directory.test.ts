import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PACKS, LOCALE_CODES, translate, type TranslationKey } from './index';

const supportKeys = ['title', 'intro', 'trusted', 'ukIreland', 'usCanada', 'world', 'directory',
  'directoryDesc', 'emergency', 'askCall'].map(key => `support.${key}` as TranslationKey);

describe('support directory locale and destination integrity', () => {
  it('has non-empty support labels in all twelve catalogues', () => {
    for (const code of LOCALE_CODES) {
      for (const key of supportKeys) expect(PACKS[code][key], code + ' ' + key).toBeTruthy();
    }
  });
  it('interpolates a trusted person's name without altering its spelling', () => {
    for (const code of LOCALE_CODES) {
      const text = translate(code, 'support.askCall', { name: 'Aaliyah' });
      expect(text, code).toContain('Aaliyah');
      expect(text, code).not.toContain('{name}');
    }
  });
  it('never translates a provider name, contact number or outbound destination', () => {
    const source = readFileSync('src/components/CrisisSupport.tsx', 'utf8');
    expect(source).toContain('href="tel:116123"');
    expect(source).toContain('href="tel:999"');
    expect(source).toContain('href="tel:988"');
    expect(source).toContain('href="https://findahelpline.com"');
    expect(source).toContain('>Samaritans</span>');
    expect(source).toContain('>Shout</span>');
    expect(source).toContain('>Find A Helpline</span>');
  });
});
