import React, { useState, useEffect } from 'react';
import { Users, Heart, Share2, PhoneCall, ChevronRight } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { isRealGuardian } from '../../guardian-alert';
import {
  SupportCapsuleCategory,
  SUPPORT_CAPSULE_CATEGORIES,
  SUPPORT_CAPSULE_CATEGORY_LABELS,
  deriveEffectiveSharing,
} from '../../support-capsules';
import { SupportContact } from '../types';
import { cn } from '../lib/utils';
import { RecoveryAlly } from './RecoveryAlly';
import { NovaGuardianRelay } from './NovaGuardianRelay';
import { AllyNudgeScheduler } from './AllyNudgeScheduler';

// My Support Circle: the top-level home for every human-support feature
// (Recovery Ally, Guardian Relay, Accountability Nudges), replacing three
// components that used to just render stacked on the same tab with no
// overview connecting them. The Overview tab answers the Master Support
// Circle spec's three home-screen questions - who's in my corner, what am
// I sharing, can I reach someone - from data these existing features
// already store. "What am I sharing" reads the real Support Capsules
// model (support-capsules.ts) - the same source of truth RecoveryAlly.tsx
// itself now uses - rather than the old blanket permissions object.

type SupportCircleView = 'overview' | 'ally' | 'guardian' | 'checkins';

interface AllySummary {
  isInvited: boolean;
  allyName: string;
  sharing: Record<SupportCapsuleCategory, boolean>;
}

const NAV_ITEMS: { id: SupportCircleView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ally', label: 'Recovery Ally' },
  { id: 'guardian', label: 'Guardian Relay' },
  { id: 'checkins', label: 'Accountability Nudges' },
];

interface MySupportCircleProps {
  contacts: SupportContact[];
  realContacts: SupportContact[];
  onAdd: (contact: Omit<SupportContact, 'id'>) => void;
  onRemove: (id: string) => void;
  userName?: string;
}

const SUPPORT_CIRCLE_VIEW_IDS: SupportCircleView[] = ['overview', 'ally', 'guardian', 'checkins'];

export const MySupportCircle = ({ contacts, realContacts, onAdd, onRemove, userName }: MySupportCircleProps) => {
  const [view, setView] = useState<SupportCircleView>('overview');
  const [allySummary, setAllySummary] = useState<AllySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Lets a deep link elsewhere in the app (e.g. Faith & Values Mode's
  // "Continue to my Recovery Ally circle") land directly on the right
  // sub-section instead of always dropping back to Overview - same
  // window-event pattern ResetStudio.tsx already uses for
  // reset_studio_select_state, dispatched just before navigate_tab.
  useEffect(() => {
    const handleSelectView = (e: Event) => {
      const detail = (e as CustomEvent<SupportCircleView>).detail;
      if (SUPPORT_CIRCLE_VIEW_IDS.includes(detail)) setView(detail);
    };
    window.addEventListener('support_circle_select_view', handleSelectView);
    return () => window.removeEventListener('support_circle_select_view', handleSelectView);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setLoadingSummary(false); return; }
      const uid = auth.currentUser.uid;
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'recovery_ally', 'state'));
        if (snap.exists()) {
          const data = snap.data();
          const capsulesSnap = await getDocs(collection(db, 'users', uid, 'support_capsules'));
          const capsules = capsulesSnap.docs.map((d) => d.data() as { category: SupportCapsuleCategory; expiresAt: string | null });
          setAllySummary({
            isInvited: !!data.isInvited,
            allyName: data.allyName || '',
            sharing: deriveEffectiveSharing(capsules, new Date().toISOString(), data.permissions || {}),
          });
        }
      } catch (e) {
        // Overview falls back to the honest "nothing shared yet" state below
        // rather than guessing at what's actually shared.
      }
      setLoadingSummary(false);
    };
    load();
  }, []);

  // Sample demo contacts are never counted as a real way to reach someone -
  // NovaGuardianRelay itself disables their live-send buttons, so claiming
  // one here would promise a capability the rest of the page doesn't.
  const reachableGuardians = realContacts.filter((c) => isRealGuardian(c) && !c.isSample);
  const sharedWith = allySummary?.isInvited
    ? SUPPORT_CAPSULE_CATEGORIES.filter((category) => allySummary.sharing[category]).map((category) => SUPPORT_CAPSULE_CATEGORY_LABELS[category])
    : [];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-medium text-text-main tracking-tight">My Support Circle</h2>
          <p className="text-text-muted text-sm mt-0.5">The people you've chosen to have alongside you.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Support Circle sections" className="flex flex-wrap items-center gap-2 border-b border-border">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={cn(
              "px-4 py-3 text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors",
              view === item.id ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-main"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Who's in my corner</h3>
            {loadingSummary ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : (
              <div className="space-y-2">
                {allySummary?.isInvited && (
                  <div className="flex items-center gap-2 text-sm text-text-main">
                    <Heart className="w-4 h-4 text-primary shrink-0" /> {allySummary.allyName || 'Your Recovery Ally'}
                  </div>
                )}
                {reachableGuardians.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 text-sm text-text-main">
                    <PhoneCall className="w-4 h-4 text-destructive shrink-0" /> {g.name}
                  </div>
                ))}
                {!allySummary?.isInvited && reachableGuardians.length === 0 && (
                  <p className="text-sm text-text-muted">Nobody yet - invite a Recovery Ally or add a trusted contact below.</p>
                )}
              </div>
            )}
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">What am I sharing</h3>
            {sharedWith.length > 0 ? (
              <ul className="space-y-1.5">
                {sharedWith.map((label) => (
                  <li key={label} className="text-sm text-text-main flex items-center gap-2">
                    <Share2 className="w-3.5 h-3.5 text-text-muted shrink-0" /> {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">Nothing shared yet.</p>
            )}
            <button onClick={() => setView('ally')} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
              Manage sharing <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Can I reach someone</h3>
            {reachableGuardians.length > 0 ? (
              <p className="text-sm text-text-main">Yes - {reachableGuardians.length} trusted contact{reachableGuardians.length > 1 ? 's' : ''} set up.</p>
            ) : (
              <p className="text-sm text-text-muted">Not yet - add a trusted contact in Guardian Relay.</p>
            )}
            <button onClick={() => setView('guardian')} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
              Open Guardian Relay <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {view === 'ally' && <RecoveryAlly />}
      {view === 'guardian' && (
        <NovaGuardianRelay contacts={contacts} onAdd={onAdd} onRemove={onRemove} userName={userName} />
      )}
      {view === 'checkins' && <AllyNudgeScheduler contacts={realContacts} />}
    </div>
  );
};
