import { useState } from 'react';
import { motion } from 'motion/react';
import { Wind } from 'lucide-react';
import { NovaChat } from './NovaChat';
import { BurnoutFingerprint } from '../types';
import { UNTANGLE_STARTER_ORDER, UNTANGLE_STARTER_LABELS, UntangleStarter } from '../../reset-studio-engine';

// NOVA BEHAVIOUR IN RESET STUDIO: quieter than elsewhere, one question at
// a time, never five insights at once, never a diagnosis or a named
// personality pattern. Reuses the real NovaChat engine rather than a
// second, separate conversational implementation - only the framing and
// opening line differ.
const UNTANGLE_SYSTEM_INSTRUCTION = `You are Nova. The user opened Reset Studio's "Untangle With Nova" because something is bothering them but they can't yet put language around it.

Be quieter than you usually are: short responses, one question at a time, never a wall of insight. Do not diagnose, label a personality pattern, or psychoanalyse what they write - your only job right now is helping them find words for what's going on, not interrogating them and not solving it yet. If it becomes clear the real issue is workload rather than a feeling to untangle, you may gently mention One Less Thing or Workload Reality Check - but don't force it, and don't change the subject from what they actually brought up.`;

const OPENING_LINES: Record<UntangleStarter, string> = {
  something_happened: "Something happened. Tell me what, whenever you're ready.",
  someone_getting_to_me: "Someone's getting to you. What's going on with them?",
  worried_about_something: "You're worried about something. What is it?",
  tired_of_everything: "Tired of everything - that's allowed. What's the heaviest part of it right now?",
  dont_know_what_feeling: "Not sure what you're feeling, that's fine. What's it doing - in your body, or in your head?",
  let_me_type: "You don't need to explain it properly. Start anywhere.",
};

export const UntangleWithNova = ({ fingerprint, onAwardPoints, onNavigate }: {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}) => {
  const [starter, setStarter] = useState<UntangleStarter | null>(null);

  return (
    <div className="card bg-background border border-border p-10 lg:p-14 text-text-main relative overflow-hidden">
      <div className="relative z-10 max-w-3xl space-y-10 mx-auto">
        <div className="space-y-6 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/10 to-primary/10 border border-primary/20 text-primary">
            <Wind className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">Untangle With Nova</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              You don't need to explain it properly. Start anywhere.
            </p>
          </div>
        </div>

        {!starter && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {UNTANGLE_STARTER_ORDER.map((id) => (
              <button
                key={id}
                onClick={() => setStarter(id)}
                className="p-4 rounded-xl border border-border hover:border-primary/50 text-left font-bold text-text-main transition-colors"
              >
                {UNTANGLE_STARTER_LABELS[id]}
              </button>
            ))}
          </div>
        )}

        {starter && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <NovaChat
              fingerprint={fingerprint}
              systemInstruction={UNTANGLE_SYSTEM_INSTRUCTION}
              initialMessage={OPENING_LINES[starter]}
              onAwardPoints={onAwardPoints}
              onNavigate={onNavigate}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
};
