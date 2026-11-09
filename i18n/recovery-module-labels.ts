// Customer-facing recovery module names, translated without changing any
// routing IDs, destination maps, or the deterministic decision copy engine.
// Use the shared bundled packs, including its English fallback.
import { MODULE_DISPLAY_NAMES } from '../recovery-decision-copy';
import { translate, type TranslationKey } from './index';

export function localizedRecoveryModuleName(
  locale: string | null | undefined,
  moduleId: string | null | undefined,
): string {
  if (!moduleId || !Object.prototype.hasOwnProperty.call(MODULE_DISPLAY_NAMES, moduleId)) {
    return translate(locale, 'module.unknown');
  }
  return translate(locale, `module.${moduleId}` as TranslationKey);
}
