import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, ExternalLink, Copy, CheckCircle2, Users, Calendar, MessageCircle } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { CommunityConfig, buildCommunityTopicLink, buildCommunityEventsLink, buildCommunityBaseLink, COMMUNITY_UNAVAILABLE_MESSAGE } from '../../community-config';
import { logGroundingEvent } from '../lib/grounding-analytics';

interface GroundingCommunityBridgeProps {
  burdenLabels: string[];
  topPatternLabel?: string;
  topPatternTopicSlug?: string;
  onClose: () => void;
}

type View = 'menu' | 'composer';

export const GroundingCommunityBridge = ({ burdenLabels, topPatternLabel, topPatternTopicSlug, onClose }: GroundingCommunityBridgeProps) => {
  const [config, setConfig] = useState<CommunityConfig | null>(null);
  const [view, setView] = useState<View>('menu');
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    secureApiFetch('/api/community/config').then((r) => r.json()).then(setConfig).catch(() => setConfig({ enabled: false, baseUrl: null }));
  }, []);

  const openLink = (url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    logGroundingEvent('community_connection_opened');
  };

  const startComposer = async () => {
    setView('composer');
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await secureApiFetch('/api/grounding/community-draft', {
        method: 'POST',
        data: { burdenLabels, ...(topPatternLabel ? { patternLabel: topPatternLabel } : {}) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not draft that right now.');
      }
      const result = await res.json();
      setDraftText(result.draftText);
    } catch (e: any) {
      setDraftError(e.message || 'Could not draft that right now.');
    } finally {
      setDrafting(false);
    }
  };

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
    } catch (e) {
      // Clipboard access can fail (permissions, browser context) - the
      // community link still opens either way, the person can select
      // and copy the text manually.
    }
    openLink(buildCommunityBaseLink(config!));
  };

  if (!config) {
    return (
      <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="text-sm text-text-muted">Loading...</div>
      </div>
    );
  }

  if (!config.enabled) {
    return (
      <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md bg-card border border-border/40 rounded-2xl p-8 space-y-6 text-center">
          <p className="text-sm text-text-muted leading-relaxed">{COMMUNITY_UNAVAILABLE_MESSAGE}</p>
          <button onClick={onClose} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">
            Close
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg bg-card border border-border/40 rounded-2xl p-8 space-y-6 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-display font-bold text-text-main">Connect with the community</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
        </div>

        {view === 'menu' && (
          <div className="space-y-3">
            <button
              onClick={() => openLink(buildCommunityTopicLink(config, topPatternTopicSlug || 'general'))}
              className="w-full p-4 rounded-xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-bold text-text-main">See how others have approached this</p>
                  <p className="text-[11px] text-text-muted">Open a relevant community discussion</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-text-muted shrink-0" />
            </button>
            <button
              onClick={startComposer}
              className="w-full p-4 rounded-xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface flex items-center gap-3"
            >
              <MessageCircle className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-bold text-text-main">Ask the community</p>
                <p className="text-[11px] text-text-muted">Nova can draft a neutral post for you to review</p>
              </div>
            </button>
            <button
              onClick={() => openLink(buildCommunityEventsLink(config))}
              className="w-full p-4 rounded-xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-bold text-text-main">Attend a live session</p>
                  <p className="text-[11px] text-text-muted">See upcoming community events</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-text-muted shrink-0" />
            </button>
          </div>
        )}

        {view === 'composer' && (
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              What would you like to share? Your private reflection is never copied automatically - review and edit this before anything is posted.
            </p>
            {drafting ? (
              <div className="py-8 text-center text-sm text-text-muted">Drafting...</div>
            ) : draftError ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{draftError}</p>
                <button onClick={startComposer} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">Try again</button>
              </div>
            ) : (
              <>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value.slice(0, 500))}
                  rows={5}
                  className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={copyAndOpen}
                    disabled={!draftText.trim()}
                    className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied - opening community' : 'Copy & open community'}
                  </button>
                  <button onClick={() => setView('menu')} className="text-xs font-bold text-text-muted hover:text-text-main">Back</button>
                </div>
                <p className="text-[11px] text-text-muted">
                  Nothing is posted automatically. This copies your edited text and opens the community in a new tab - you choose whether and where to post it.
                </p>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
