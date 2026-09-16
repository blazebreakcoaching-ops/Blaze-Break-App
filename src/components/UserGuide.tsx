import React from 'react';
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
} from 'lucide-react';

interface GuideFeature {
  tab: string;
  tag: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

// Grounded in the real tabs in ALL_TABS (App.tsx) - this only describes
// features that actually exist, with an "Open" button that jumps straight
// to the real tab rather than just describing it.
const FEATURES: GuideFeature[] = [
  { tab: 'home', tag: 'Pulse', title: 'Your daily Pulse', description: "Where you land every time you open the app. One suggested action for today, your recovery stage, and your trend over time - not a to-do list.", icon: Home },
  { tab: 'diagnose', tag: 'Check-in', title: 'Check-in', description: "A short, honest self-assessment (not a medical test) that builds your personal burnout picture. The rest of the app is quietly built around it.", icon: MapPin },
  { tab: 'recover', tag: 'Recover', title: 'Energy budget', description: 'See where your energy is actually going this week, and where to protect some back.', icon: BatteryFull },
  { tab: 'fuel', tag: 'Nutrition', title: 'Recovery fuel', description: 'Simple, low-effort food ideas for days when cooking is one decision too many.', icon: Apple },
  { tab: 'reset', tag: 'Nervous System', title: 'Reset', description: "Short, guided techniques for calming down when you're wired or overloaded.", icon: Wind },
  { tab: 'anxiety_reset', tag: 'Anxiety Reset', title: 'In-the-moment relief', description: 'Quick tools for when anxiety spikes and you need something right now, not a plan.', icon: HeartPulse },
  { tab: 'wellbeing', tag: 'Anxiety Check-in', title: 'GAD-7, about a minute', description: 'A short, well-established seven-question self-check, so you can notice a pattern before it builds up.', icon: Activity },
  { tab: 'communicate', tag: 'Communicate', title: 'Workload negotiator', description: "Generates a ready-to-send script for the awkward conversation, so you're not writing it from scratch while stressed.", icon: MessageSquare },
  { tab: 'reflect', tag: 'Reflect', title: 'Weekly review', description: 'A few minutes at the end of the week to notice what actually helped, in your own words.', icon: Book },
  { tab: 'nova', tag: 'Nova Coach', title: 'Talk it through', description: "Text or voice, whichever you'd rather use. Nova remembers your context, so you don't have to re-explain yourself every time.", icon: Sparkles },
  { tab: 'ally', tag: 'Recovery Ally', title: 'Someone in your corner', description: "Invite a trusted friend, mentor, or partner to check in - you choose exactly what they see, and can turn any of it off any time.", icon: HeartPulse },
  { tab: 'privacy', tag: 'Privacy Centre', title: 'Your data, your rules', description: 'See exactly what is stored, export it, or delete it - always on, nothing to go looking for.', icon: Lock },
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

      {/* Feature grid */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-3 px-1">Pick what fits today</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.tab} className="rounded-xl bg-card border border-border p-5 flex flex-col">
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-[#9a3412] dark:text-primary flex items-center justify-center shrink-0 mb-3">
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">{f.tag}</p>
                <p className="text-sm font-bold text-text-main mb-2">{f.title}</p>
                <p className="text-xs text-text-muted leading-relaxed flex-1">{f.description}</p>
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
