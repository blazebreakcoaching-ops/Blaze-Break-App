import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '../lib/i18n-react';
import { LanguageSelector } from './LanguageSelector';
import { ExperienceLevelSwitcher } from './ExperienceLevelSwitcher';
import type { LocaleCode } from '../../i18n';

function Harness({ start = 'en' as LocaleCode }) {
  const [locale, setLocale] = useState<LocaleCode>(start);
  return (
    <I18nProvider locale={locale} onLocaleChange={setLocale}>
      <Selector />
      <ExperienceLevelSwitcher level="novice" onChange={vi.fn()} />
    </I18nProvider>
  );
}
function Selector() {
  const { locale, setLocale } = useI18n();
  return <LanguageSelector id="lang" value={locale} onChange={setLocale} />;
}

beforeEach(() => {
  document.documentElement.lang = '';
  document.documentElement.dir = '';
  window.localStorage.clear();
});

describe('language switching (web)', () => {
  it('lists all 12 languages by their native names, each marked with its own lang', () => {
    render(<Harness />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(12);
    expect(options.map((o) => o.textContent)).toContain('العربية — Arabic');
    expect(options.find((o) => o.getAttribute('value') === 'hi')!.getAttribute('lang')).toBe('hi');
  });

  it('switches instantly, updates <html lang/dir> for screen readers and RTL, and remembers the device choice', () => {
    render(<Harness />);
    expect(document.documentElement.lang).toBe('en-GB');
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar' } });
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('radiogroup', { name: 'مستوى تجربتك' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'مبتدئ' }).getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('blaze_ui_locale')).toBe('ar');
    // The machine-draft notice is shown for every non-English language.
    expect(screen.getByText(/الذكاء الاصطناعي/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('اللغة'), { target: { value: 'de' } });
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('radio', { name: 'Einsteiger' })).toBeTruthy();
  });

  it('English shows no translation-review notice', () => {
    render(<Harness />);
    expect(screen.queryByText(/AI assistance/)).toBeNull();
  });
});
