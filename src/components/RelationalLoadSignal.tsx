import { useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { cn } from '../lib/utils';

// Social Battery's real new home - Relational Load Signal. The legacy
// Hub's 0-100% slider implied a precision this never had; this asks the
// qualitative question the spec gives verbatim instead, and never shows a
// fake percentage. A new collection (relational_load_signals), separate
// from the legacy Hub's own preferences/recovery_intelligence.socialBattery
// field, which is left untouched since it still feeds that page's own
// (soon to be fully retired) velocity formula.

type LoadValue = 'more_drained' | 'about_the_same' | 'more_restored';

const OPTIONS: { value: LoadValue; label: string }[] = [
  { value: 'more_drained', label: 'More drained' },
  { value: 'about_the_same', label: 'About the same' },
  { value: 'more_restored', label: 'More restored' },
];

const VALUE_LABELS: Record<LoadValue, string> = {
  more_drained: 'More drained', about_the_same: 'About the same', more_restored: 'More restored',
};

interface SignalEntry {
  id: string;
  value: LoadValue;
  createdAt: string;
}

export const RelationalLoadSignal = () => {
  const [history, setHistory] = useState<SignalEntry[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const uid = auth.currentUser?.uid;

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'relational_load_signals'), orderBy('createdAt', 'desc'), limit(10));
      const snap = await getDocs(q);
      setHistory(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      setError('You do not have permission to access this record.');
    }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const submit = async (value: LoadValue) => {
    if (!uid) return;
    setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, 'users', uid, 'relational_load_signals', Date.now().toString()), { value, createdAt: now });
      fetchHistory();
    } catch (e) {
      setError('This entry could not be saved.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">How did that interaction leave you?</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => submit(opt.value)}
              disabled={saving}
              className={cn('py-2.5 px-3 rounded-lg border text-xs font-bold text-text-main hover:border-primary/50 transition-colors')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Recent check-ins</h4>
          {history.map((item) => (
            <div key={item.id} className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
              <span className="text-xs font-bold">{VALUE_LABELS[item.value]}</span>
              <span className="text-[10px] text-text-muted">{new Date(item.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
