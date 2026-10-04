import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ListChecks, PenLine, Radar, TrendingUp, ShieldCheck, FlaskConical, Plus, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { loadRecentFirewallDecisions } from '../lib/capacity-firewall-service';
import { loadRecentBoundaryOutcomes, BoundaryOutcomeRecord } from '../lib/boundary-outcome-service';
import { loadRecentBoundaryScripts } from '../lib/boundary-script-service';
import {
  createBoundaryContract, reviewBoundaryContract, loadBoundaryContracts, BoundaryContractRecord,
} from '../lib/boundary-contract-service';
import {
  summarizeBoundariesChosen, summarizeBoundariesPractising, summarizeWhatUsuallyTestsThem,
  summarizeWhatHasWorked, countCapacityProtected, summarizeExperimentsTrying,
} from '../../my-boundaries-engine';
import { BoundaryMemoryEntry } from '../../boundary-outcome-engine';
import {
  BOUNDARY_CONTRACT_CATEGORY_ORDER, BOUNDARY_CONTRACT_CATEGORY_LABELS, BOUNDARY_CONTRACT_CATEGORY_PROMPTS,
  CONTRACT_REVIEW_CHOICE_ORDER, CONTRACT_REVIEW_CHOICE_LABELS, CONTRACT_REVIEW_QUESTION,
  applyContractReview, suggestsContractNeedsRevisiting, NEEDS_REVISITING_LINE,
  BoundaryContractCategory, ContractReviewChoice,
} from '../../boundary-contract-engine';

const SectionCard = ({ icon: Icon, title, isEmpty, emptyText, children }: {
  icon: any; title: string; isEmpty: boolean; emptyText: string; children: React.ReactNode;
}) => (
  <div className="bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
    <h4 className="text-xs font-black uppercase tracking-widest text-text-main flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" /> {title}
    </h4>
    {isEmpty ? <p className="text-xs text-text-muted italic">{emptyText}</p> : children}
  </div>
);

// My Boundaries: a non-gamified reflective view of real stored history
// across Capacity Firewall, Boundary Autopilot, and Boundary Architect -
// no score, streak, or badge, just what's actually happened. Toggled the
// same way Recovery Fuel's "My Patterns" is: a local view switch within
// an existing section, not a new nav item.
export const MyBoundaries = () => {
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState<ReturnType<typeof summarizeBoundariesChosen>>([]);
  const [practising, setPractising] = useState<ReturnType<typeof summarizeBoundariesPractising>>([]);
  const [testsThem, setTestsThem] = useState<ReturnType<typeof summarizeWhatUsuallyTestsThem>>([]);
  const [hasWorked, setHasWorked] = useState<ReturnType<typeof summarizeWhatHasWorked> | null>(null);
  const [protectedCount, setProtectedCount] = useState(0);
  const [experiments, setExperiments] = useState<ReturnType<typeof summarizeExperimentsTrying>>([]);

  const [contracts, setContracts] = useState<BoundaryContractRecord[]>([]);
  const [addingContract, setAddingContract] = useState(false);
  const [newCategory, setNewCategory] = useState<BoundaryContractCategory>('after_hours_messages');
  const [newResponse, setNewResponse] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [changeDraft, setChangeDraft] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setLoaded(true); return; }
      const uid = auth.currentUser.uid;
      try {
        const [decisions, outcomes, scripts, loadedContracts] = await Promise.all([
          loadRecentFirewallDecisions(uid),
          loadRecentBoundaryOutcomes(uid),
          loadRecentBoundaryScripts(uid),
          loadBoundaryContracts(uid),
        ]);
        setChosen(summarizeBoundariesChosen(decisions));
        setPractising(summarizeBoundariesPractising(scripts));
        const memoryEntries: BoundaryMemoryEntry[] = outcomes
          .filter((o): o is BoundaryOutcomeRecord & {
            requestSource: NonNullable<BoundaryOutcomeRecord['requestSource']>;
            outcome: NonNullable<BoundaryOutcomeRecord['outcome']>;
          } => o.requestSource !== null && o.outcome !== null)
          .map((o) => ({ source: o.requestSource, outcome: o.outcome }));
        setTestsThem(summarizeWhatUsuallyTestsThem(memoryEntries));
        setHasWorked(summarizeWhatHasWorked(outcomes));
        setProtectedCount(countCapacityProtected(outcomes));
        setExperiments(summarizeExperimentsTrying(decisions));
        setContracts(loadedContracts);
      } catch {
        // Leaves every section honestly empty rather than fabricating data.
      }
      setLoaded(true);
    };
    load();
  }, []);

  const startAddContract = () => {
    setAddingContract(true);
    setNewCategory('after_hours_messages');
    setNewResponse('');
  };

  const saveNewContract = async () => {
    if (!auth.currentUser || !newResponse.trim()) return;
    const id = await createBoundaryContract(auth.currentUser.uid, {
      category: newCategory, customLabel: null, defaultResponse: newResponse.trim(),
    });
    setContracts((prev) => [
      { id, category: newCategory, customLabel: null, defaultResponse: newResponse.trim(), reviewHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ...prev,
    ]);
    setAddingContract(false);
    setNewResponse('');
  };

  const submitReview = async (contract: BoundaryContractRecord, choice: ContractReviewChoice) => {
    if (!auth.currentUser) return;
    if (choice === 'change' && !changeDraft.trim()) return;
    const newResponseText = applyContractReview(contract.defaultResponse, choice, changeDraft);
    const reviewHistory = [...contract.reviewHistory, { at: new Date().toISOString(), choice }];
    await reviewBoundaryContract(auth.currentUser.uid, contract.id, { defaultResponse: newResponseText, reviewHistory });
    setContracts((prev) => prev.map((c) => (c.id === contract.id ? { ...c, defaultResponse: newResponseText, reviewHistory } : c)));
    setReviewingId(null);
    setChangeDraft('');
  };

  if (!loaded) return null;

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">My Boundaries</div>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <h3 className="text-3xl font-display font-bold text-text-main tracking-tight">What's actually happened</h3>
        <p className="text-text-muted font-medium mt-2">
          Built from your real history across Capacity Firewall, Boundary Autopilot, and Boundary Architect. No score, no streak.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <SectionCard icon={ListChecks} title="Boundaries I've Chosen" isEmpty={chosen.length === 0} emptyText="Nothing decided yet - it'll show up here once you run a demand through Capacity Firewall.">
          <ul className="space-y-2">
            {chosen.map((c, i) => (
              <li key={i} className="text-sm text-text-main">
                <span className="font-bold">{c.choiceLabel}:</span> {c.demandDescription}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={PenLine} title="Practising" isEmpty={practising.length === 0} emptyText="No drafts in progress right now.">
          <ul className="space-y-2">
            {practising.map((s, i) => (
              <li key={i} className="text-sm text-text-main">{s.title}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={Radar} title="What Usually Tests Them" isEmpty={testsThem.length === 0} emptyText="Not enough consistent history yet to name a real pattern - that's intentional, it won't guess.">
          <ul className="space-y-2">
            {testsThem.map((t, i) => (
              <li key={i} className="text-sm text-text-main">
                <span className="font-bold">{t.sourceLabel}:</span> {t.pattern}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={TrendingUp} title="What Has Worked" isEmpty={!hasWorked?.available || !hasWorked.line} emptyText="Not enough confirmed outcomes yet to say what's actually working.">
          <p className="text-sm text-text-main">{hasWorked?.line}</p>
        </SectionCard>

        <SectionCard icon={ShieldCheck} title="Capacity I've Protected" isEmpty={protectedCount === 0} emptyText="None confirmed yet - this only counts a real, confirmed reduction, never a draft or a practice run.">
          <p className="text-sm text-text-main font-bold">{protectedCount} real demand{protectedCount === 1 ? '' : 's'} reduced</p>
        </SectionCard>

        <SectionCard icon={FlaskConical} title="Experiments I'm Trying" isEmpty={experiments.length === 0} emptyText="No open Conditional Yes experiments right now.">
          <ul className="space-y-2">
            {experiments.map((e, i) => (
              <li key={i} className="text-sm text-text-main">
                <span className="font-bold">{e.leverLabel ?? 'Conditional Yes'}:</span> {e.demandDescription}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-text-main">My Default Boundaries</h4>
          {!addingContract && (
            <button onClick={startAddContract} className="text-xs font-bold text-primary flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add one
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted">
          Decide it once, ahead of time. Nothing here is auto-enforced - when it's tested, you choose Keep, Make an Exception, or Change it.
        </p>

        {addingContract && (
          <div className="p-4 rounded-xl bg-surface/50 border border-border/50 space-y-3">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as BoundaryContractCategory)}
              className="w-full bg-surface border border-border/50 rounded-lg p-2 text-sm text-text-main"
            >
              {BOUNDARY_CONTRACT_CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{BOUNDARY_CONTRACT_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <label className="text-xs font-bold text-text-muted">{BOUNDARY_CONTRACT_CATEGORY_PROMPTS[newCategory]}</label>
            <textarea
              value={newResponse}
              onChange={(e) => setNewResponse(e.target.value)}
              maxLength={300}
              rows={2}
              className="w-full bg-surface border border-border/50 rounded-lg p-2 text-sm text-text-main"
              placeholder="Write your default response..."
            />
            <div className="flex gap-2">
              <button onClick={saveNewContract} disabled={!newResponse.trim()} className="btn-primary text-xs px-3 py-1.5">Save</button>
              <button onClick={() => setAddingContract(false)} className="text-xs text-text-muted px-3 py-1.5">Cancel</button>
            </div>
          </div>
        )}

        {contracts.length === 0 && !addingContract ? (
          <p className="text-xs text-text-muted italic">No default boundaries set yet.</p>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract) => {
              const needsRevisit = suggestsContractNeedsRevisiting(contract.reviewHistory);
              return (
                <div key={contract.id} className="p-4 rounded-xl bg-surface/50 border border-border/50 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="text-xs font-bold text-text-main uppercase tracking-wider">{BOUNDARY_CONTRACT_CATEGORY_LABELS[contract.category]}</h5>
                      <p className="text-sm text-text-main mt-1">{contract.defaultResponse}</p>
                    </div>
                    {reviewingId !== contract.id && (
                      <button onClick={() => { setReviewingId(contract.id); setChangeDraft(contract.defaultResponse); }} className="text-xs font-bold text-primary shrink-0">
                        It got tested
                      </button>
                    )}
                  </div>
                  {needsRevisit && reviewingId !== contract.id && (
                    <p className="text-xs text-warning dark:text-[#f0b429]">{NEEDS_REVISITING_LINE}</p>
                  )}
                  {reviewingId === contract.id && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pt-2 border-t border-border/40">
                      <p className="text-xs font-bold text-text-main">{CONTRACT_REVIEW_QUESTION}</p>
                      <div className="flex flex-wrap gap-2">
                        {CONTRACT_REVIEW_CHOICE_ORDER.map((choice) => (
                          <button
                            key={choice}
                            onClick={() => submitReview(contract, choice)}
                            disabled={choice === 'change' && !changeDraft.trim()}
                            className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border", choice === 'change' ? 'border-primary/30 text-primary' : 'border-border/50 text-text-main hover:bg-surface')}
                          >
                            {CONTRACT_REVIEW_CHOICE_LABELS[choice]}
                          </button>
                        ))}
                        <button onClick={() => setReviewingId(null)} className="text-xs text-text-muted px-2 py-1.5 flex items-center gap-1">
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                      <textarea
                        value={changeDraft}
                        onChange={(e) => setChangeDraft(e.target.value)}
                        maxLength={300}
                        rows={2}
                        className="w-full bg-surface border border-border/50 rounded-lg p-2 text-xs text-text-main"
                        placeholder="If changing the default, write the new one here first."
                      />
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
