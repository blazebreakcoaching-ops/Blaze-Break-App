import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { useAuth } from '../lib/auth';
import { AdaptiveFeedbackHistory } from './AdaptiveFeedbackHistory';

// This is one UI surface for the existing users/{uid}/nova_permissions/current
// consent document. It does not create a second personalisation store.
const MODULES = [
  ['guided_reset', 'Guided Reset'],
  ['one_less_thing', 'One Less Thing'],
  ['capacity_firewall', 'Capacity Firewall'],
  ['recovery_fuel', 'Recovery Fuel'],
  ['my_patterns', 'My Patterns'],
] as const;
type SavedPreferences = {
  allowAdaptiveIntelligence?: boolean;
  adaptivePreferredModules?: string[];
  adaptiveAvoidedModules?: string[];
};
const knownModules = new Set<string>(MODULES.map(([id]) => id));

export function NovaAdaptiveControls() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
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
    setOwnerUid(null);
    setEnabled(false);
    setMemoryAllowed(false);
    setPreferred([]);
    setAvoided([]);
    setSaving(false);
    setError('');
    setStatus('loading');
    if (!uid || auth.currentUser?.uid !== uid) {
      setStatus('error');
      return () => { active = false; };
    }
    void getDoc(doc(db, 'users', uid, 'nova_permissions', 'current')).then(snap => {
      if (!active || auth.currentUser?.uid !== uid) return;
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
      setOwnerUid(uid);
      setStatus('ready');
    }).catch(() => {
      if (active && auth.currentUser?.uid === uid) setStatus('error');
    });
    return () => { active = false; };
  }, [uid, retry]);

  const canEdit = status === 'ready' && !!uid && uid === ownerUid && auth.currentUser?.uid === uid && !saving;
  const save = async (changes: SavedPreferences) => {
    const requestUid = uid;
    if (!requestUid || !canEdit) return;
    setSaving(true);
    setError('');
    try {
      if (changes.allowAdaptiveIntelligence === true) {
        // Recheck the authoritative consent before switching learning ON.
        const current = await getDoc(doc(db, 'users', requestUid, 'nova_permissions', 'current'));
        if (!current.exists() || current.data().allowNovaMemory !== true || current.data().allowNovaUseSavedMemories !== true) {
          if (auth.currentUser?.uid === requestUid) {
            setMemoryAllowed(false);
            setEnabled(false);
          }
          throw new Error('Nova Memory must be enabled before adaptation.');
        }
      }
      if (auth.currentUser?.uid !== requestUid || ownerUid !== requestUid) return;
      await setDoc(doc(db, 'users', requestUid, 'nova_permissions', 'current'), {
        ...changes,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (auth.currentUser?.uid !== requestUid || ownerUid !== requestUid) return;
      if (typeof changes.allowAdaptiveIntelligence === 'boolean') setEnabled(changes.allowAdaptiveIntelligence);
      if (changes.adaptivePreferredModules) setPreferred(changes.adaptivePreferredModules);
      if (changes.adaptiveAvoidedModules) setAvoided(changes.adaptiveAvoidedModules);
    } catch {
      if (auth.currentUser?.uid === requestUid && ownerUid === requestUid) {
        setError('Your preference could not be saved. Please check Nova Memory and try again.');
      }
    } finally {
      if (auth.currentUser?.uid === requestUid && ownerUid === requestUid) setSaving(false);
    }
  };

  const setModule = (id: string, choice: 'neutral' | 'preferred' | 'avoided') => {
    if (!knownModules.has(id) || !enabled) return;
    void save({
      adaptivePreferredModules: [...preferred.filter(x => x !== id), ...(choice === 'preferred' ? [id] : [])],
      adaptiveAvoidedModules: [...avoided.filter(x => x !== id), ...(choice === 'avoided' ? [id] : [])],
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border p-4 space-y-3" aria-label="Nova Adaptive Intelligence settings">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-text-main">Nova Adaptive Intelligence</h4>
            <p className="text-xs text-text-muted mt-1">
              Optional. With your permission, Nova can adapt suggestions using your previous feedback.
              Your direct request and safety boundaries always take priority.
            </p>
          </div>
          <button type="button" role="switch" aria-checked={status === 'ready' && ownerUid === uid && enabled}
            aria-label="Allow Nova to learn from my feedback"
            disabled={!canEdit || (!enabled && !memoryAllowed)}
            onClick={() => { void save({ allowAdaptiveIntelligence: !enabled }); }}
            className="rounded-full border border-border px-3 py-1 text-xs text-text-main">
            {status === 'ready' && enabled ? 'On' : 'Off'}
          </button>
        </div>
        {status === 'error' && (
          <p role="alert" className="text-xs text-text-muted">
            Learning preferences could not be loaded. Changes are paused.
            <button type="button" className="ml-2 underline" onClick={() => setRetry(v => v + 1)}>Try again</button>
          </p>
        )}
        {status === 'ready' && !memoryAllowed && (
          <p className="text-xs text-text-muted">Enable Nova Memory in Privacy Controls before enabling adaptive learning.</p>
        )}
        {status === 'ready' && enabled && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">Optional preferences. You can change them at any time.</p>
            {MODULES.map(([id, label]) => (
              <div key={id} className="flex flex-wrap justify-between items-center gap-2 text-xs">
                <span className="text-text-main">{label}</span>
                <div className="flex gap-1">
                  {(['neutral', 'preferred', 'avoided'] as const).map(choice => {
                    const selected = choice === 'preferred' ? preferred.includes(id)
                      : choice === 'avoided' ? avoided.includes(id)
                      : !preferred.includes(id) && !avoided.includes(id);
                    return (
                      <button type="button" key={choice} disabled={!canEdit}
                        aria-pressed={selected}
                        onClick={() => setModule(id, choice)}
                        className={selected ? 'rounded-md border border-primary px-2 py-1 text-primary' : 'rounded-md border border-border px-2 py-1 text-text-muted'}>
                        {choice === 'neutral' ? 'No preference' : choice === 'preferred' ? 'More' : 'Less'}
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
      {status === 'ready' && ownerUid === uid && (
        <AdaptiveFeedbackHistory onReset={() => {
          setEnabled(false);
          setPreferred([]);
          setAvoided([]);
        }} />
      )}
    </div>
  );
}
