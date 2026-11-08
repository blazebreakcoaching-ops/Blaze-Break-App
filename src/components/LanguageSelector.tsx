import { SUPPORTED_LOCALES, type LocaleCode } from '../../i18n';
import { useI18n } from '../lib/i18n-react';

// Native-language names, with the honest review status underneath.
export function LanguageSelector({ id, value, onChange, className }: {
  id: string;
  value: LocaleCode;
  onChange: (locale: LocaleCode) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-text-muted">{t('settings.language')}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as LocaleCode)}
        aria-describedby={value === 'en' ? undefined : `${id}-note`}
        className={className ?? 'w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-main'}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>
            {l.nativeName}{l.code === 'en' ? '' : ` — ${l.englishName}`}
          </option>
        ))}
      </select>
      {value !== 'en' && (
        <p id={`${id}-note`} className="text-xs text-text-muted">{t('settings.languageDraft')}</p>
      )}
    </div>
  );
}
