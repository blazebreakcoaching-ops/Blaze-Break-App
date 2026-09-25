import React, { useState } from 'react';
import { Compass, Send, Mic, ArrowRight, Lock } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { NovaVoiceCall } from './NovaVoiceCall';

// Self-paced Locate + Accept - the two BLAME steps nobody can genuinely do
// alone while activated. No timer here at all: a "Continue" only appears
// once the person has engaged (or skipped), and it's them, not a clock,
// who decides when to move on. Text is available to every tier; voice is
// a genuine paid-only upgrade (see the `voiceEligible` prop, sourced from
// the blame_voice capability check in BLAMEResetOverlay).

interface GeminiHistoryTurn {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

export interface BlameExchangeSummary {
  mode: 'text' | 'voice' | 'skipped';
  turns: number;
}

interface BlameLocateAcceptExchangeProps {
  title: string;
  instruction: string;
  prompt: string;
  voiceEligible: boolean;
  onContinue: (summary: BlameExchangeSummary) => void;
}

const MAX_TEXT_TURNS = 3;

const BLAME_LOCATE_ACCEPT_SYSTEM_INSTRUCTION = `You are Nova, guiding someone through the Locate + Accept step of a BLAME Reset - a short crisis-interrupt technique. They are mid-activation right now, not journaling calmly afterward.

Locate asks: "What am I actually reacting to?" Accept asks: "What's true right now, even if I don't like it?"

Every reply: offer exactly ONE short, warm, grounding reflection or clarifying question that helps them name the real trigger underneath the surface reaction, and/or accept what's true without fighting it. Never a lecture, never a numbered list, never more than 2-3 sentences, never more than one question at a time. Do not introduce a new framework. This exchange is capped at a few messages - treat every reply as possibly the last thing you say before they move to deciding what to do about it next.`;

export const BlameLocateAcceptExchange = ({ title, instruction, prompt, voiceEligible, onContinue }: BlameLocateAcceptExchangeProps) => {
  const [history, setHistory] = useState<GeminiHistoryTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [novaReplyReceived, setNovaReplyReceived] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || turnCount >= MAX_TEXT_TURNS) return;
    setSending(true);
    setError(null);
    const priorHistory = history;
    setInput('');
    try {
      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: text,
          systemInstruction: BLAME_LOCATE_ACCEPT_SYSTEM_INSTRUCTION,
          history: priorHistory,
        },
      });
      const data = await response.json();
      setHistory([
        ...priorHistory,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: data.text || '' }] },
      ]);
      setNovaReplyReceived(true);
      setTurnCount(c => c + 1);
    } catch (e) {
      // Never trap someone here on a network blip - Continue still works.
      setError("Couldn't reach Nova just now. You can try again, or continue.");
    }
    setSending(false);
  };

  const handleContinue = () => {
    onContinue({ mode: novaReplyReceived ? 'text' : 'skipped', turns: turnCount });
  };

  const handleVoiceClose = () => {
    setVoiceOpen(false);
    onContinue({ mode: 'voice', turns: 0 });
  };

  const capped = turnCount >= MAX_TEXT_TURNS;

  return (
    <div className="space-y-5 w-full text-left">
      <div className="flex flex-col items-center text-center gap-2">
        <Compass className="w-7 h-7 text-primary" />
        <h3 className="text-2xl font-display font-extrabold text-text-main tracking-tight">{title}</h3>
        <p className="text-xs text-text-muted leading-relaxed font-medium max-w-xs">{instruction}</p>
        <p className="text-sm font-bold text-text-main italic pt-1 max-w-xs">&ldquo;{prompt}&rdquo;</p>
      </div>

      {voiceEligible && (
        <button
          onClick={() => setVoiceOpen(true)}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-[#9a3412] dark:text-primary py-2 px-3 rounded-xl border border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <Mic className="w-3.5 h-3.5" /> Talk it through by voice instead
        </button>
      )}

      {history.length > 0 && (
        <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar">
          {history.map((turn, i) => (
            <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                turn.role === 'user'
                  ? 'bg-primary/15 text-text-main rounded-br-sm'
                  : 'bg-surface dark:bg-card/40 border border-border text-text-main rounded-bl-sm'
              }`}>
                {turn.parts[0]?.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive text-center">{error}</p>}

      {!capped && (
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="What's going on..."
            rows={2}
            disabled={sending}
            aria-label="Tell Nova what's going on"
            className="flex-1 bg-surface dark:bg-card/40 border border-border rounded-xl p-3 text-xs text-text-main resize-none focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
      {capped && (
        <p className="text-[10px] text-text-muted text-center uppercase tracking-widest font-bold">That's enough for now</p>
      )}

      <div className="flex flex-col items-center gap-2 pt-1">
        {novaReplyReceived && (
          <button
            onClick={handleContinue}
            className="w-full btn-primary py-3 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {!novaReplyReceived && (
          <button
            onClick={handleContinue}
            className="text-[11px] text-text-muted hover:text-text-main underline underline-offset-2 cursor-pointer"
          >
            Skip this step for now
          </button>
        )}
      </div>

      {!voiceEligible && (
        <p className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted">
          <Lock className="w-3 h-3" aria-hidden="true" /> Voice mode is a paid feature
        </p>
      )}

      {voiceOpen && (
        <NovaVoiceCall
          isOpen={voiceOpen}
          onClose={handleVoiceClose}
          sessionContext="blame"
          buildInitialPrompt={() =>
            "This is the Locate + Accept step of a BLAME Reset - a short crisis-interrupt technique. " +
            "The person is mid-activation right now. Help them answer, briefly and out loud: " +
            "\"What am I actually reacting to?\" and \"What's true right now, even if I don't like it?\" " +
            "Keep your turns short - this is a grounding exchange, not an open-ended coaching call. " +
            "When they sound ready to move on, say so warmly and let them end the call."
          }
        />
      )}
    </div>
  );
};
