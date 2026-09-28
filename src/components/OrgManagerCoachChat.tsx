import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Send, ShieldCheck } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { cn } from '../lib/utils';

interface PlanTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
  planTrace?: PlanTraceEntry[];
}

// A short, honest label for each real tool Nova actually called this turn -
// shown under her reply so "live and agentic" is visible, not just claimed.
// Matches the tool names in NOVA_ORG_COACH_TOOLS (server.ts).
const TOOL_LABELS: Record<string, string> = {
  get_team_climate_trend: 'team climate trend',
  get_team_breakdown: 'per-team breakdown',
  get_team_detail: 'team detail',
  get_engagement_and_recognition_signal: 'engagement & recognition',
  get_cost_of_pressure_snapshot: 'cost of pressure',
  get_team_escalation_status: 'escalation follow-up status',
  get_meeting_load_signal: 'meeting load',
};

const HISTORY_LIMIT = 20;

// The org-facing equivalent of NovaChat.tsx, but deliberately much smaller:
// no voice, no memory, no feature-suggestion cards - this coach only ever
// sees aggregate, k-anonymity-gated numbers about the whole org (never an
// individual), so there's nothing here for those individual-facing features
// to attach to. Real, multi-turn, tool-calling conversation is the point -
// replacing the old single-shot "Get Nova's suggestions" button, which
// never let a manager ask a follow-up question.
interface OrgManagerCoachChatProps {
  orgId: string;
  // Lets another part of the dashboard (e.g. the Manager Action Library
  // cards) ask a real question on the admin's behalf instead of just
  // sitting there as a static, unclickable-looking reference list. Fires
  // once per change, then the parent clears it via onSeedConsumed.
  seedMessage?: string | null;
  onSeedConsumed?: () => void;
}

export const OrgManagerCoachChat = ({ orgId, seedMessage, onSeedConsumed }: OrgManagerCoachChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState<{ cohortSize: number; threshold: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (seedMessage) {
      send(seedMessage);
      onSeedConsumed?.();
    }
  }, [seedMessage]);

  const send = async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', parts: [{ text }] };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await secureApiFetch(`/api/org/${orgId}/manager-coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          // Same client-side history convention as NovaChat.tsx - the
          // server never persists the conversation itself, only reads
          // whatever's sent on each turn.
          history: messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, parts: m.parts })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nova couldn't respond right now.");
      } else if (data.locked) {
        setLocked({ cohortSize: data.cohortSize, threshold: data.threshold });
      } else {
        setMessages((prev) => [...prev, { role: 'model', parts: [{ text: data.text || '' }], planTrace: data.planTrace }]);
      }
    } catch (e) {
      setError("Nova couldn't respond right now.");
    }
    setLoading(false);
  };

  if (locked) {
    return (
      <div className="card space-y-3">
        <h4 className="font-bold text-text-main flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Nova, your manager coach</h4>
        <p className="text-sm text-text-muted leading-relaxed">
          Not enough opted-in teammates yet ({locked.cohortSize} of the {locked.threshold} needed) for Nova to see any real, safely-anonymised signal. This unlocks automatically once enough people consent.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <h4 className="font-bold text-text-main flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Nova, your manager coach</h4>
        <p className="text-xs text-text-muted max-w-xl leading-relaxed">
          Ask her anything about your team's climate, engagement, or the cost case for recovery support - she pulls the org's own real numbers as she answers. Fed only aggregate, anonymised signals; she sees exactly what you see, nothing more.
        </p>
      </div>

      {messages.length === 0 && !loading && (
        <div className="flex flex-wrap gap-2">
          {[
            "How's the team doing right now?",
            'Any teams I should look at specifically?',
            "What's this week's engagement like?",
            'Make the cost case for investing here',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => send(prompt)}
              className="px-3 py-1.5 bg-surface hover:bg-border border border-border rounded-full text-xs text-text-muted transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] p-3 rounded-xl text-sm leading-relaxed',
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-surface dark:bg-card/40 border border-border text-text-main',
              )}>
                {m.parts[0].text}
                {m.role === 'model' && m.planTrace && m.planTrace.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
                    <ShieldCheck className="w-3 h-3 text-text-muted shrink-0" />
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-black">
                      Checked: {m.planTrace.map((t) => TOOL_LABELS[t.tool] || t.tool).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Nova is checking the real numbers…
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive dark:text-[#f87171] text-xs rounded-xl">{error}</div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask Nova about your team…"
          disabled={loading}
          className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default OrgManagerCoachChat;
