import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { useAuth } from '../lib/auth';
import { AdaptiveFeedbackHistory } from './AdaptiveFeedbackHistory';
import { localizedRecoveryModuleName } from '../../i18n/recovery-module-labels';
import { useI18n } from '../lib/i18n-react';

// This is one UI surface for the existing users/{uid}/nova_permissions/current
// consent document. It does not create a second personalisation store.
const MODULE_IDS = [
  'guided_reset', 'one_less_thing', 'capacity_firewall', 'recovery_fuel', 'my_patterns',
] as const;
type SavedPreferences = {
  allowAdaptiveIntelligence?: boolean;
  adaptivePreferredModules?: string[];
  adaptiveAvoidedModules?: string[];
};
const knownModules = new Set<string>(MODULE_IDS);

export function NovaAdaptiveControls() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const uid = user?.uid ?? null;
  // A same-UID sign-out/sign-in is a new session; never reuse its settings.
  const [ownerSession, setOwnerSession] = useState<typeof user>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [memoryAllowed, setMemoryAllowed] = useState(false);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setOwnerSession(null);
    setEnabled(false);
    setMemoryAllowed(false);
    setPreferred([]);
    setAvoided([]);
    setSaving(false);
    setError('');
    setStatus('loading');
    if (!user || !uid || auth.currentUser !== user) {
      setStatus('error');
      return () => { active = false; };
    }
    void getDoc(doc(db, 'users', uid, 'nova_permissions', 'current')).then(snap => {
      if (!active || auth.currentUser !== user) return;
      const data = snap.exists() ? snap.data() : {};
      const canUseMemory = data.allowNovaMemory === true && data.allowNovaUseSavedMemories === true;
      setMemoryAllowed(canUseMemory);
      setEnabled(canUseMemory && data.allowAdaptiveIntelligence === true);
      setPreferred(Array.isArray(data.adaptivePreferredModules)
        ? data.adaptivePreferredModules.filter((id: unknown): id is string => typeof id === 'string' && knownModules.has(id))
        : []);
      setAvoided(Array.isArray(data.adaptiveAvoidedModules)
        ? data.adaptiveAvoidedModules.filter((id: unknown): id is string => typeof id === 'string' && knownModules.has(id))
        : []);
      setOwnerSession(user);
      setStatus('ready');
    }).catch(() => {
      if (active && auth.currentUser === user) setStatus('error');
    });
    return () => { active = false; };
  }, [user, retry]);

  const canEdit = status === 'ready' && !!user && ownerSession === user && auth.currentUser === user && !saving;
  const save = async (changes: SavedPreferences) => {
    const requestUser = user;
    const requestUid = uid;
    if (!requestUser || !requestUid || !canEdit) return;
    setSaving(true);
    setError('');
    try {
      if (changes.allowAdaptiveIntelligence === true) {
        // Recheck the authoritative consent before switching learning ON.
        const current = await getDoc(doc(db, 'users', requestUid, 'nova_permissions', 'current'));
        if (!current.exists() || current.data().allowNovaMemory !== true || current.data().allowNovaUseSavedMemories !== true) {
          if (auth.currentUser === requestUser) {
            setMemoryAllowed(false);
            setEnabled(false);
          }
          throw new Error('Nova Memory must be enabled before adaptation.');
        }
      }
      if (auth.currentUser !== requestUser || ownerSession !== requestUser) return;
      await setDoc(doc(db, 'users', requestUid, 'nova_permissions', 'current'), {
        ...changes,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (auth.currentUser !== requestUser || ownerSession !== requestUser) return;
      if (typeof changes.allowAdaptiveIntelligence === 'boolean') setEnabled(changes.allowAdaptiveIntelligence);
      if (changes.adaptivePreferredModules) setPreferred(changes.adaptivePreferredModules);
      if (changes.adaptiveAvoidedModules) setAvoided(changes.adaptiveAvoidedModules);
    } catch {
      if (auth.currentUser === requestUser && ownerSession === requestUser) {
        setError(t('adaptive.saveError'));
      }
    } finally {
      if (auth.currentUser === requestUser && ownerSession === requestUser) setSaving(false);
    }
  };

  const setModule = (id: string, choice: 'neutral' | 'preferred' | 'avoided') => {
    if (!knownModules.has(id) || !enabled || !canEdit) return;
    void save({
      adaptivePreferredModules: [...preferred.filter(x => x !== id), ...(choice === 'preferred' ? [id] : [])],
      adaptiveAvoidedModules: [...avoided.filter(x => x !== id), ...(choice === 'avoided' ? [id] : [])],
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border p-4 space-y-3" aria-label={t('adaptive.title')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-text-main">{t('adaptive.title')}</h4>
            <p className="text-xs text-text-muted mt-1">
              {t('adaptive.description')}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={status === 'ready' && ownerSession === user && enabled}
            aria-label={t('adaptive.allowAria')}
            disabled={!canEdit || (!enabled && !memoryAllowed)}
            onClick={() => { void save({ allowAdaptiveIntelligence: !enabled }); }}
            className="rounded-full border border-border px-3 py-1 text-xs text-text-main">
            {status === 'ready' && enabled ? t('adaptive.on') : t('adaptive.off')}
          </button>
        </div>
        {status === 'error' && (
          <p role="alert" className="text-xs text-text-muted">
            {t('adaptive.loadError')}
            <button type="button" className="ml-2 underline" onClick={() => setRetry(v => v + 1)}>{t('adaptive.retry')}</button>
          </p>
        )}
        {status === 'ready' && !memoryAllowed && (
          <p className="text-xs text-text-muted">{t('adaptive.memoryRequired')}</p>
        )}
        {status === 'ready' && enabled && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">{t('adaptive.preferencesHelp')}</p>
            {MODULE_IDS.map(id => (
              <div key={id} className="flex flex-wrap justify-between items-center gap-2 text-xs">
                <span className="text-text-main">{localizedRecoveryModuleName(locale, id)}</span>
                <div className="flex gap-1">
                  {(['neutral', 'preferred', 'avoided'] as const).map(choice => {
                    const selected = choice === 'preferred' ? preferred.includes(id)
                      : choice === 'avoided' ? avoided.includes(id)
                      : !preferred.includes(id) && !avoided.includes(id);
                    return (
                      <button type="button" key={choice} disabled={!canEdit}
                        aria-pressed={selected}
                        aria-label={t('adaptive.choiceAria', {
                          module: localizedRecoveryModuleName(locale, id),
                          choice: t(`adaptive.choice.${choice}`),
                        })}
                        onClick={() => setModule(id, choice)}
                        className={selected ? 'rounded-md border border-primary px-2 py-1 text-primary' : 'rounded-md border border-border px-2 py-1 text-text-muted'}>
                        {t(`adaptive.choice.${choice}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </section>
      {status === 'ready' && ownerSession === user && auth.currentUser === user && (
        <AdaptiveFeedbackHistory onReset={() => {
          if (auth.currentUser !== user || ownerSession !== user) return;
          setEnabled(false);
          setPreferred([]);
          setAvoided([]);
        }} />
      )}
    </div>
  );
}
