import React from 'react';
import { ShieldCheck, Lock, FileText, ArrowLeft, Brain, Database, Server, Building, Users } from 'lucide-react';
import { RecommendationLedger } from './RecommendationLedger.tsx';

interface TrustCentrePageProps {
  onBack: () => void;
}

export const TrustCentrePage = ({ onBack }: TrustCentrePageProps) => {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-[#9a3412] dark:selection:text-primary relative overflow-hidden text-text-main pb-32">
      {/* Premium Glow Aura Backdrops */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#161f30_1px,transparent_1px),linear-gradient(to_bottom,#161f30_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center backdrop-blur-xl bg-background/70 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-primary to-primary/70 rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-display font-black text-lg tracking-tight text-text-main leading-none">Blaze Break</h1>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9a3412] dark:text-primary mt-1">Trust Centre</span>
          </div>
        </div>
        <button 
          onClick={onBack}
          className="text-xs uppercase tracking-widest px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-white/[0.05] transition-colors font-bold text-text-muted"
        >
          <ArrowLeft className="w-4 h-4" /> Return
        </button>
      </nav>

      <main className="relative z-10 pt-40 px-6 max-w-4xl mx-auto space-y-24">
        
        {/* Hero */}
        <section className="text-center space-y-6">
          <h2 className="text-4xl md:text-6xl font-light tracking-tight text-text-main leading-tight">
            The moat is <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary/70 to-primary italic font-serif font-normal">trust.</span>
          </h2>
          <p className="text-text-muted text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            Blaze Break understands you, but it does not expose you. We help organisations improve culture, but we do not allow them to spy on staff. Welcome to our public trust and assurance documentation.
          </p>
        </section>

        {/* The Zones */}
        <section className="space-y-8">
          <div className="flex items-center gap-3 mb-8">
             <div className="p-3 rounded-xl bg-primary/10 text-primary border border-primary/20"><Database className="w-6 h-6" /></div>
             <div>
               <h3 className="text-2xl font-bold text-text-main tracking-tight">The Data Zones Architecture</h3>
               <p className="text-sm text-text-muted mt-1">How we partition user data.</p>
             </div>
          </div>
          
          <div className="grid gap-4">
            <div className="p-6 rounded-2xl bg-surface border border-primary/10">
              <h4 className="font-bold text-text-main mb-2 flex items-center gap-2"><Lock className="w-4 h-4 text-primary" /> Zone A: Private Recovery Vault</h4>
              <p className="text-sm text-text-muted leading-relaxed font-light">Visible only to the user and Nova where permitted. Contains conversations, Mood Pulses, journals, recovery scores, and personal reflections. Never exposed upward.</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-surface border border-success/10">
              <h4 className="font-bold text-text-main mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-success dark:text-[#4ade80]" /> Zone B: Shared Recovery Ally Space</h4>
              <p className="text-sm text-text-muted leading-relaxed font-light">Visible only when the user actively chooses to share something specific. Contains only curated items like "I completed my weekly recovery goal".</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-surface border border-muted-foreground/10">
              <h4 className="font-bold text-text-main mb-2 flex items-center gap-2"><Building className="w-4 h-4 text-text-muted" /> Zone C & D: Organisation Space & Team Insight Layer</h4>
              <p className="text-sm text-text-muted leading-relaxed font-light">Records that an organisation has paid for access, and provides managers with strictly anonymous trending metrics (e.g. "Workload pressure rising").</p>
            </div>
          </div>
        </section>

        <section>
          <RecommendationLedger />
        </section>

        {/* Security & Governance */}
        <section className="space-y-8">
          <div className="flex items-center gap-3 mb-8">
             <div className="p-3 rounded-xl bg-primary/10 text-primary border border-primary/20"><Brain className="w-6 h-6" /></div>
             <div>
               <h3 className="text-2xl font-bold text-text-main tracking-tight">Nova AI Governance</h3>
               <p className="text-sm text-text-muted mt-1">Our principles for responsible AI coaching.</p>
             </div>
          </div>

          <div className="prose dark:prose-invert prose-primary max-w-none text-text-muted font-light text-sm leading-loose">
            <p>
              Nova is our proprietary recovery coach. She is provided access to your data only when you permit it, and her actions are heavily constrained by our deterministic permission engine.
            </p>
            <ul className="space-y-4 mt-6">
              <li><strong className="text-text-main font-medium">Memory Transparency:</strong> Users possess a dedicated "Memory Centre" within the app. You can explicitly view, audit, and delete any patterns Nova has derived about you.</li>
              <li><strong className="text-text-main font-medium">Action Sandbox:</strong> Nova operates under a principle of "Advise, don't execute." She can draft messages and recommend schedules, but she cannot automatically send messages to an employer under any circumstances.</li>
              <li><strong className="text-text-main font-medium">No Medical Claims:</strong> Nova is not a therapist or a medical device. She is an analytical, direct recovery coach focused on ambition and stability. If clinical thresholds are detected, she redirects to professional care.</li>
            </ul>
          </div>
        </section>

        {/* Policies */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
           <div className="p-6 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer border border-white/[0.05] flex items-center gap-4 group">
             <div className="p-3 bg-primary/20 text-[#9a3412] dark:text-primary rounded-xl group-hover:scale-110 transition-transform"><FileText className="w-5 h-5"/></div>
             <div>
               <h4 className="text-text-main font-bold text-sm tracking-wide">Privacy Notice</h4>
               <p className="text-xs text-text-muted mt-1">How we process your personal data.</p>
             </div>
           </div>
           
           <div className="p-6 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer border border-white/[0.05] flex items-center gap-4 group">
             <div className="p-3 bg-primary/20 text-[#9a3412] dark:text-primary rounded-xl group-hover:scale-110 transition-transform"><Server className="w-5 h-5"/></div>
             <div>
               <h4 className="text-text-main font-bold text-sm tracking-wide">Security Assessment</h4>
               <p className="text-xs text-text-muted mt-1">Our technical protection measures.</p>
             </div>
           </div>
           
           <div className="p-6 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer border border-white/[0.05] flex items-center gap-4 group">
             <div className="p-3 bg-primary/20 text-[#9a3412] dark:text-primary rounded-xl group-hover:scale-110 transition-transform"><FileText className="w-5 h-5"/></div>
             <div>
               <h4 className="text-text-main font-bold text-sm tracking-wide">Terms of Use</h4>
               <p className="text-xs text-text-muted mt-1">Rules and boundaries for the platform.</p>
             </div>
           </div>
           
           <div className="p-6 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer border border-white/[0.05] flex items-center gap-4 group">
             <div className="p-3 bg-primary/20 text-[#9a3412] dark:text-primary rounded-xl group-hover:scale-110 transition-transform"><Building className="w-5 h-5"/></div>
             <div>
               <h4 className="text-text-main font-bold text-sm tracking-wide">Organisation Ethics</h4>
               <p className="text-xs text-text-muted mt-1">Agreement for sponsoring employers.</p>
             </div>
           </div>
        </section>

        {/* Help & FAQ */}
        <section className="space-y-8 pb-20 border-t border-white/[0.05] pt-12">
          <div className="flex items-center gap-3 mb-8">
             <div>
               <h3 className="text-2xl font-bold text-text-main tracking-tight">Help & Support FAQ</h3>
               <p className="text-sm text-text-muted mt-1">Common questions regarding privacy and usage.</p>
             </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-3 p-6 bg-background border border-white/[0.02] rounded-2xl">
               <h4 className="text-text-main font-bold text-sm">Can my manager see my data?</h4>
               <p className="text-text-muted font-light text-xs leading-relaxed">No. Under no circumstances can your employer read your private journal, Nova conversations, or identify you in reports. They only see anonymised aggregations (Zone D).</p>
             </div>
             <div className="space-y-3 p-6 bg-background border border-white/[0.02] rounded-2xl">
               <h4 className="text-text-main font-bold text-sm">How do I export or delete my data?</h4>
               <p className="text-text-muted font-light text-xs leading-relaxed">Inside the app, navigate to the Privacy Centre. Under the "Consent" tab, you will find options to download a JSON archive of all your entries or permanently erase your account.</p>
             </div>
             <div className="space-y-3 p-6 bg-background border border-white/[0.02] rounded-2xl">
               <h4 className="text-text-main font-bold text-sm">What is the Burnout Fingerprint?</h4>
               <p className="text-text-muted font-light text-xs leading-relaxed">It is a proprietary diagnostic that assesses your behavioral loop (e.g. over-functioning, fawning, isolation) so Nova can provide targeted boundary-setting scripts rather than generic wellness advice.</p>
             </div>
             <div className="space-y-3 p-6 bg-background border border-white/[0.02] rounded-2xl">
               <h4 className="text-text-main font-bold text-sm">What does a Recovery Ally see?</h4>
               <p className="text-text-muted font-light text-xs leading-relaxed">Only what you explicitly choose to share using the Share interaction. Typically this just includes goal milestone celebrations or "check-in requested" pings. They cannot browse your history.</p>
             </div>
          </div>
        </section>

      </main>
    </div>
  );
};
