import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.ts';

interface PolicySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export const PrivacyPolicyAccordion = () => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const policies: PolicySection[] = [
    {
      id: 'data_collection',
      title: '1. What Data We Collect',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>We believe in minimal data extraction. We only collect what is strictly necessary to power Nova's coaching logic and your personal recovery dashboards.</p>
          <ul className="list-disc pl-5 space-y-1 text-text-muted">
            <li><strong>Somatic Flags:</strong> Heart rate variability and stress indicators (only stored locally).</li>
            <li><strong>Self-Reported Mood:</strong> Daily check-ins and journal entries.</li>
            <li><strong>Metadata:</strong> App usage metrics, anonymized for system performance tuning.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'employer_firewall',
      title: '2. The Employer Firewall',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>Your organisation cannot see your personal recovery data. The firewall is cryptographically enforced natively within our architecture.</p>
          <p>If your access is sponsored by your employer, they receive an aggregated "Team Climate" dashboard. Anonymized data is only sent if there are <strong>10 or more participants</strong> in the cohort, ensuring you cannot be singled out.</p>
        </div>
      )
    },
    {
      id: 'ai_boundaries',
      title: '3. AI Boundaries & Constraints',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>Nova is a coaching intelligence, not a medical device. It operates under strict guidelines:</p>
          <ul className="list-disc pl-5 space-y-1 text-text-muted">
            <li>Nova is prohibited from making clinical diagnoses.</li>
            <li>We do not train external foundation models on your private journal entries.</li>
            <li>You can view and purge Nova's contextual memory at any time.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'data_retention',
      title: '4. Data Retention & Erasure',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>We automatically purge legacy chat histories after 30 days. You have the ultimate right of erasure.</p>
          <p>Selecting "Delete My Account" permanently cryptographically shreds all your associated data across all zones instantly, with no cool-down or recovery period. We retain zero shadow profiles.</p>
        </div>
      )
    }
  ];

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text-main text-lg tracking-tight">Privacy Policy Details</h3>
          <p className="text-xs text-text-muted mt-1">Plain-English transparency on our operational rules.</p>
        </div>
      </div>

      <div className="space-y-3">
        {policies.map((policy) => {
          const isActive = activeSection === policy.id;
          return (
            <div 
              key={policy.id} 
              className={cn(
                "rounded-xl border transition-all duration-500 overflow-hidden cursor-pointer",
                isActive 
                  ? "bg-surface border-primary/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                  : "bg-background/40 border-white/[0.04] hover:bg-surface/60"
              )}
              onClick={() => setActiveSection(isActive ? null : policy.id)}
            >
              <div className="p-5 flex items-center justify-between">
                <h4 className={cn(
                  "font-bold transition-colors duration-300",
                  isActive ? "text-primary" : "text-text-main"
                )}>
                  {policy.title}
                </h4>
                <ChevronDown className={cn(
                  "w-5 h-5 transition-transform duration-500 ease-in-out",
                  isActive ? "rotate-180 text-primary" : "text-text-muted"
                )} />
              </div>
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                  >
                    <div className="px-5 pb-5 pt-1">
                      {policy.content}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};
