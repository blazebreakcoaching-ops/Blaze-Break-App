import React, { useState } from 'react';
import {
  HelpCircle,
  Sparkles,
  ArrowRight,
  Home,
  MapPin,
  BatteryFull,
  Apple,
  Wind,
  HeartPulse,
  Activity,
  MessageSquare,
  Book,
  Lock,
  PhoneCall,
  ListChecks,
} from 'lucide-react';

interface GuideFeature {
  tab: string;
  tag: string;
  title: string;
  description: string;
  icon: React.ElementType;
  definition?: { term: string; text: string };
  // Real on-screen names of the individual tools inside a multi-tool
  // section, verified against each tool's own heading rather than
  // guessed from its component name. Collapsed behind a toggle by
  // default (see `expandedCard`) - printing every one of these under
  // every card would break this page's own "skim, don't study" rule.
  subTools?: string[];
}

// A small "what does this mean?" mark - click/tap (not hover, which the
// app's other hand-rolled tooltips use but doesn't work on mobile touch)
// toggles a short definition panel. Independent open state per instance:
// these are one-sentence popovers, so there's no real cost to two being
// open at once.
const DefinitionMark = ({ term, definition }: { term: string; definition: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle ml-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? `Hide definition of ${term}` : `What does "${term}" mean?`}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-primary/60 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="note"
          className="absolute z-50 top-full left-0 mt-2 w-64 max-w-[85vw] p-3 bg-card text-left border border-border rounded-lg shadow-lg block"
        >
          <span className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1">{term}</span>
          <span className="block text-xs text-text-muted leading-relaxed">{definition}</span>
        </span>
      )}
    </span>
  );
};

// Grounded in the real tabs in ALL_TABS (App.tsx) - this only describes
// features that actually exist, with an "Open" button that jumps straight
// to the real tab rather than just describing it.
//
// Deliberately excluded: org, evolution, intelligence, admin (manager/
// platform-admin only - a different audience from everyone who can see
// this guide) and executive (App.tsx's route-protection effect redirects
// straight back to Home for anyone who isn't an executive or admin the
// instant that tab is opened - since this guide is visible to every role,
// an "Open" button here would silently bounce most readers who tapped it).
// Grouped by what someone actually needs, not just tab order.
const START_HERE: GuideFeature[] = [
  {
    tab: 'home', tag: 'Pulse', title: 'Your daily Pulse', description: "Where you land every time you open the app. One suggested action for today, your recovery stage, and your trend over time - not a to-do list.", icon: Home,
    definition: { term: 'Recovery Velocity', text: "Which direction your recovery is trending right now, and how fast - not where you are today, but whether things are getting better, holding steady, or slipping." },
  },
  {
    tab: 'diagnose', tag: 'Check-in', title: 'Check-in', description: "A short, honest self-assessment (not a medical test) that builds your personal burnout picture. The rest of the app is quietly built around it.", icon: MapPin,
    definition: { term: 'Burnout Fingerprint', text: "A short, honest self-assessment - not a medical test - that builds your personal burnout picture. The rest of the app is quietly built around it." },
  },
  {
    tab: 'plan', tag: 'Recovery Plan', title: 'Your Recovery Plan', description: "A small, specific starting point based on your Check-in - practical next steps, not a rigid programme. It updates as your Check-in and your week change.", icon: ListChecks,
    definition: { term: 'Recovery Debt', text: "A single running score for sustained stress, low energy, and skipped rest, combined into one number - the higher it is, the more your recovery is 'owed,' not a measure of how little you got done." },
  },
];

const DAILY_TOOLS: GuideFeature[] = [
  {
    tab: 'recover', tag: 'Recover', title: 'Energy budget', description: 'See where your energy is actually going this week, and where to protect some back.', icon: BatteryFull,
    definition: { term: 'Energy Budget', text: "Where your energy actually goes each day and each week, and how much you have left before you're overdrawn - a budget, but for capacity instead of money." },
    subTools: ['7-Day Recovery Cycle', 'Energy Delta Management', 'Nova Focus Zone', 'Energy & Capacity', 'Micro-Recovery Menu', 'The "One Less Thing" Button', 'Workload Reality Check'],
  },
  { tab: 'fuel', tag: 'Nutrition', title: 'Recovery fuel', description: 'Simple, low-effort food ideas for days when cooking is one decision too many.', icon: Apple },
  {
    tab: 'reset', tag: 'Nervous System', title: 'Reset', description: "Short, guided techniques for calming down when you're wired or overloaded.", icon: Wind,
    subTools: ['The Rumination Furnace', 'Nervous System Reset Studio', 'Sleep & Wind-Down Builder', 'Movement Snacks', 'The Decompression Doorway', 'Recovery Recipes', 'Faith & Values Grounding', 'Resource Library', 'Quick micro-interventions (breathing, movement, and more)'],
  },
  { tab: 'anxiety_reset', tag: 'Anxiety Reset', title: 'In-the-moment relief', description: 'Quick tools for when anxiety spikes and you need something right now, not a plan.', icon: HeartPulse },
  {
    tab: 'wellbeing', tag: 'Anxiety Check-in', title: 'GAD-7, about a minute', description: 'A short, well-established seven-question self-check, so you can notice a pattern before it builds up.', icon: Activity,
    definition: { term: 'GAD-7', text: "A short, well-established self-check for anxiety symptoms. It's a way to notice how you're doing over time - it is not a diagnosis, and only you ever see it." },
  },
];

const TALK_TOOLS: GuideFeature[] = [
  {
    tab: 'communicate', tag: 'Communicate', title: 'Workload negotiator', description: "Generates a ready-to-send script for the awkward conversation, so you're not writing it from scratch while stressed.", icon: MessageSquare,
    subTools: ['Boundary Rehearsal', 'Boundary Autopilot', 'Workload Negotiator', 'Hard Talk Prep', 'Digital Boundary Shield', 'Nova Overload Shield'],
  },
  { tab: 'nova', tag: 'Nova Coach', title: 'Talk it through', description: "Text or voice, whichever you'd rather use. Nova remembers your context, so you don't have to re-explain yourself every time.", icon: Sparkles },
];

const SAFETY_NET: GuideFeature[] = [
  {
    tab: 'reflect', tag: 'Reflect', title: 'Weekly review', description: 'A few minutes at the end of the week to notice what actually helped, in your own words.', icon: Book,
    subTools: ['Daily reflection journal', 'Resentment Tracker'],
  },
  {
    tab: 'ally', tag: 'Recovery Ally', title: 'Someone in your corner', description: "Invite a trusted friend, mentor, or partner to check in - you choose exactly what they see, and can turn any of it off any time.", icon: HeartPulse,
    definition: { term: 'Guardian Protocol', text: "A one-tap way to ask a trusted contact you've chosen in advance to reach out to you. It's always something you start yourself - the app never watches for risk or sends anything without you tapping the button first." },
  },
  { tab: 'privacy', tag: 'Privacy Centre', title: 'Your data, your rules', description: 'See exactly what is stored, export it, or delete it - always on, nothing to go looking for.', icon: Lock },
];

const FEATURE_GROUPS: { label: string; features: GuideFeature[] }[] = [
  { label: 'Start here', features: START_HERE },
  { label: 'Day-to-day recovery tools', features: DAILY_TOOLS },
  { label: 'When you need to talk', features: TALK_TOOLS },
  { label: 'Reflection & safety net', features: SAFETY_NET },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I have to check in every day?',
    a: "No. Daily use helps the trend charts and Nova's suggestions feel sharper, but there's no penalty for gaps — pick it back up whenever, streak or no streak.",
  },
  {
    q: 'What if I only ever use one feature?',
    a: 'Completely fine. Pulse plus the Check-in is a genuinely complete way to use this app. Everything else is there for when you want it, not because you need to grow into it.',
  },
  {
    q: 'Can my employer see what I write?',
    a: 'No. If your account is connected to an organisation, they only ever see anonymised, aggregated trends across enough people to protect anyone’s identity — never your individual entries, chats, or check-ins.',
  },
  {
    q: 'Is Nova a substitute for therapy?',
    a: 'No — Nova is a coach for day-to-day burnout recovery, not a clinician. For anything clinical or urgent, please use the crisis support options below or speak to a qualified professional.',
  },
];

export const UserGuide = ({ onNavigate }: { onNavigate?: (tab: string) => void }) => {
  // One card's "what's inside" list open at a time - unlike DefinitionMark's
  // independent state, these lists run 6-9 items long, so several open
  // together would make the page balloon unpredictably.
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  return (
    <div className="space-y-8 pb-12">
      {/* Intro / masthead */}
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-medium text-text-main tracking-tight">User Guide</h2>
              <p className="text-primary/70 text-xs font-medium uppercase tracking-widest mt-1">Plain English, no jargon</p>
            </div>
          </div>
          <p className="text-text-muted text-sm leading-relaxed max-w-2xl">
            This app has a lot in it, on purpose — some days you'll want the full toolkit, most days you'll want thirty seconds and a nudge in the right direction. This guide is here so you always know which is which.
          </p>
        </div>
      </div>

      {/* If it feels overwhelming */}
      <div className="rounded-xl bg-surface border border-primary/20 p-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">Read this bit first</p>
        <h3 className="text-lg font-display font-medium text-text-main mb-3">If the app itself feels like too much right now</h3>
        <p className="text-sm text-text-muted leading-relaxed mb-4 max-w-2xl">
          That's a completely normal reaction to an app about burnout — and it's worth saying plainly: nothing in here is compulsory.
        </p>
        <div className="bg-card border border-border p-5 rounded-lg max-w-2xl mb-5">
          <p className="text-sm text-text-main leading-relaxed">
            <strong className="text-[#9a3412] dark:text-primary">The minimum that still counts:</strong> open Blaze Break, look at your Pulse screen, and do the one thing it suggests. That's it. That's a complete visit. You don't need to work through every tab or finish a streak.
          </p>
        </div>
        <ul className="space-y-3 max-w-2xl">
          <li className="text-sm text-text-muted leading-relaxed"><strong className="text-text-main">You will never "fall behind."</strong> No leaderboard, no undone good weeks. Streaks are encouragement, not a debt.</li>
          <li className="text-sm text-text-muted leading-relaxed"><strong className="text-text-main">Skim, don't study.</strong> The features below are here to find when you need them, not to read front-to-back first.</li>
          <li className="text-sm text-text-muted leading-relaxed"><strong className="text-text-main">One tool is enough.</strong> Plenty of people use this app for months and only ever touch two or three parts of it — that's using it correctly.</li>
        </ul>
      </div>

      {/* Getting started */}
      <div className="rounded-xl bg-card border border-border p-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">First five minutes</p>
        <h3 className="text-lg font-display font-medium text-text-main mb-5">Getting started</h3>
        <div className="space-y-4 max-w-2xl">
          {[
            { n: 1, t: 'Sign in', d: 'One account, synced across your devices.' },
            { n: 2, t: 'Do the Check-in', d: 'A short self-assessment that builds your personal burnout picture.' },
            { n: 3, t: 'Look at your Recovery Plan', d: 'A small, specific starting point based on your Check-in — a suggestion, not an instruction.' },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-[#9a3412] dark:text-primary flex items-center justify-center shrink-0 text-sm font-bold font-display">
                {s.n}
              </div>
              <div>
                <p className="text-sm font-bold text-text-main">{s.t}</p>
                <p className="text-sm text-text-muted leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature grid, grouped by what someone actually needs */}
      <div className="space-y-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary px-1">Pick what fits today</p>
        {FEATURE_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-bold text-text-main mb-3 px-1">{group.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.tab} className="rounded-xl bg-card border border-border p-5 flex flex-col">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-[#9a3412] dark:text-primary flex items-center justify-center shrink-0 mb-3">
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">{f.tag}</p>
                    <p className="text-sm font-bold text-text-main mb-2">
                      {f.title}
                      {f.definition && <DefinitionMark term={f.definition.term} definition={f.definition.text} />}
                    </p>
                    <p className="text-xs text-text-muted leading-relaxed flex-1">{f.description}</p>
                    {f.subTools && (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpandedCard(expandedCard === f.tab ? null : f.tab)}
                          aria-expanded={expandedCard === f.tab}
                          className="mt-3 self-start flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-primary"
                        >
                          {expandedCard === f.tab ? "Hide what's inside" : "See what's inside"}
                        </button>
                        {expandedCard === f.tab && (
                          <ul className="mt-2 space-y-1">
                            {f.subTools.map((t) => (
                              <li key={t} className="text-[11px] text-text-muted leading-relaxed">&middot; {t}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate(f.tab)}
                        className="mt-4 self-start flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#9a3412] dark:text-primary hover:underline"
                      >
                        Open <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="rounded-xl bg-card border border-border p-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">Quick answers</p>
        <h3 className="text-lg font-display font-medium text-text-main mb-5">Questions people actually ask</h3>
        <div className="max-w-2xl divide-y divide-border">
          {FAQ.map((item) => (
            <details key={item.q} className="py-4 group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-bold text-text-main">
                {item.q}
                <span className="text-primary text-lg leading-none shrink-0 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-sm text-text-muted leading-relaxed mt-3">{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Crisis support */}
      <div className="bg-surface border border-destructive/20 p-6 rounded-xl max-w-2xl">
        <p className="text-[11px] font-black uppercase tracking-widest text-destructive dark:text-[#f87171] mb-2">Always reachable, from anywhere in the app</p>
        <h4 className="text-sm font-bold text-text-main mb-2">If things feel urgent right now</h4>
        <p className="text-xs text-text-muted leading-relaxed mb-4">
          The Crisis Support button is available on every screen. From there you can also ask a Recovery Ally guardian to call you, with one tap.
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <a href="tel:116123" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-destructive/40 transition-colors">
            <PhoneCall className="w-3.5 h-3.5 text-destructive dark:text-[#f87171]" />
            <span className="font-bold text-text-main">Samaritans</span>
            <span className="text-text-muted">116 123 &middot; free &middot; 24/7</span>
          </a>
          <a href="sms:85258&body=SHOUT" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-destructive/40 transition-colors">
            <MessageSquare className="w-3.5 h-3.5 text-destructive dark:text-[#f87171]" />
            <span className="font-bold text-text-main">Shout</span>
            <span className="text-text-muted">Text "SHOUT" to 85258</span>
          </a>
          <a href="tel:999" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-destructive/40 transition-colors">
            <PhoneCall className="w-3.5 h-3.5 text-destructive dark:text-[#f87171]" />
            <span className="font-bold text-text-main">Immediate danger</span>
            <span className="text-text-muted">Call 999</span>
          </a>
        </div>
      </div>
    </div>
  );
};
