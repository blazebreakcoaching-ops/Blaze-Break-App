import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Settings, Activity, Cloud, BarChart, FileText, AlertTriangle, Server, Zap, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags.ts';

export const AssuranceCentre = () => {
  const [activeTab, setActiveTab] = useState('governance');
  const flags = useFeatureFlags();

  const tabs = [
    { id: 'governance', icon: FileText, label: 'Product Governance' },
    { id: 'ai', icon: Zap, label: 'AI Governance' },
    { id: 'privacy', icon: Lock, label: 'Privacy & Consent' },
    { id: 'safety', icon: AlertTriangle, label: 'Safety Protocol' },
    { id: 'security', icon: Server, label: 'Security & Auth' },
    { id: 'compliance', icon: ShieldCheck, label: 'Compliance Features' },
    { id: 'evidence', icon: BarChart, label: 'Evidence & ROI' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-text-main">Assurance Blueprint</h1>
          </div>
          <p className="text-text-muted max-w-2xl text-sm leading-relaxed mt-2">
            The operational spine of Blaze Break. Production-ready, legally safe, enterprise-grade architecture controls.
            <br />
            <span className="text-primary font-semibold mt-1 inline-block">Status: Prototype validation. Not for clinical use.</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl font-medium tracking-wide transition-all whitespace-nowrap border",
              activeTab === tab.id 
                ? "bg-primary/10 border-primary/20 text-primary shadow-inner" 
                : "bg-surface/40 border-white/[0.04] text-text-muted hover:text-text-main hover:bg-surface/80"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card space-y-8">
        {activeTab === 'governance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Product Boundaries</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                <strong className="text-text-main">Intended Purpose:</strong> Blaze Break is a non-clinical burnout recovery, wellbeing education and sustainable-performance support platform. It helps users reflect on pressure patterns, build recovery routines, communicate boundaries and access chosen human support. 
                <br /><br />
                <strong className="text-destructive">Exclusions:</strong> It does not diagnose, treat or replace medical or emergency services. It is not an MHRA medical device.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-surface/50 border border-white/[0.04]">
                <h3 className="font-semibold text-text-main mb-1">Approved Claims</h3>
                <ul className="text-xs text-text-muted space-y-1 list-disc list-inside">
                  <li>Wellbeing education</li>
                  <li>Burnout pattern reflection</li>
                  <li>Recovery routine building</li>
                  <li>Boundary communication practice</li>
                </ul>
              </div>
              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20">
                <h3 className="font-semibold text-destructive mb-1">Banned Claims</h3>
                <ul className="text-xs text-rose-300/80 space-y-1 list-disc list-inside">
                  <li>Detect burnout</li>
                  <li>Prevent burnout</li>
                  <li>Emergency detection</li>
                  <li>Treatment or clinical recovery</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Nova AI Governance</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                Controller mechanisms for the Nova recovery coach, limiting actions, output schemas, and medical exclusions.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-surface/40 border border-white/[0.04] rounded-2xl">
                <div>
                  <h3 className="font-semibold text-text-main text-sm">Action Permission Centre</h3>
                  <p className="text-xs text-text-muted mt-1">Rule: Nova may only execute approved non-destructive actions.</p>
                </div>
                <div className="text-xs font-mono text-success bg-success/10 px-2 py-1 rounded-md">ENFORCED</div>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface/40 border border-white/[0.04] rounded-2xl">
                <div>
                  <h3 className="font-semibold text-text-main text-sm">Medical Claim Ban</h3>
                  <p className="text-xs text-text-muted mt-1">Rule: Nova fallback enforced if medical terminology or crisis identified.</p>
                </div>
                <div className="text-xs font-mono text-success bg-success/10 px-2 py-1 rounded-md">ACTIVE</div>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface/40 border border-white/[0.04] rounded-2xl">
                <div>
                  <h3 className="font-semibold text-text-main text-sm">Memory Centre Access</h3>
                  <p className="text-xs text-text-muted mt-1">Rule: User controls AI read/write context. Erase allowed.</p>
                </div>
                <div className="text-xs font-mono text-warning bg-warning/10 px-2 py-1 rounded-md">PENDING UX</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Data & Privacy Architecture</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                Implementation of Data Protection Impact Assessment (DPIA) guidelines, tenant separation, and anonymity rules.
              </p>
            </div>
            <div className="grid gap-4">
              <div className="p-5 rounded-2xl bg-surface/50 border border-white/[0.04] space-y-2">
                <h3 className="font-semibold text-primary text-sm">Personal vs. Organization Separation</h3>
                <p className="text-xs text-text-muted">
                  Strict context boundary. Employer-sponsored users exist in a 'Participation Space' for anonymous trends. Private 'Recovery Vault' history is never accessible to employers.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-surface/50 border border-white/[0.04] space-y-2">
                <h3 className="font-semibold text-primary text-sm">Anonymity Thresholds</h3>
                <p className="text-xs text-text-muted">
                  Minimum N=10 rule applied to all employer dashboards before any grouped wellbeing trends or survey data is visible. Individual indicators (Recovery Velocity, Mood Pulse) are suppressed.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-surface/50 border border-white/[0.04] space-y-2">
                <h3 className="font-semibold text-primary text-sm">Data Inventory Map</h3>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.04] text-text-muted">
                        <th className="py-2 pr-4 font-normal">Data Item</th>
                        <th className="py-2 pr-4 font-normal">Who Sees It</th>
                        <th className="py-2 font-normal">Org Visibility</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-muted">
                      <tr className="border-b border-white/[0.04]">
                        <td className="py-2">Mood Pulse</td>
                        <td className="py-2">User + Nova</td>
                        <td className="py-2">Never individual</td>
                      </tr>
                      <tr className="border-b border-white/[0.04]">
                        <td className="py-2">Team Morale Input</td>
                        <td className="py-2">Aggregated Employer</td>
                        <td className="py-2">Grouped only</td>
                      </tr>
                      <tr>
                        <td className="py-2">Trusted Contacts</td>
                        <td className="py-2">User + Safety Logic</td>
                        <td className="py-2">Never</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Guardian & Safety Framework</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                Rules governing the Guardian Protocol and emergency signposting. Not an automated crisis detection system.
              </p>
            </div>
            <div className="p-6 bg-warning/10 border border-warning/20 rounded-2xl border-dashed">
              <h3 className="text-warning font-bold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Operational Safeguards
              </h3>
              <ul className="text-sm text-warning space-y-2 list-none">
                <li>• No AI auto-triggering without explicit user confirmation step.</li>
                <li>• Clear indication that messages may fail or be delayed.</li>
                <li>• Fallback static signposting to crisis helplines always visible.</li>
                <li>• 18+ adult cohort restriction (youth pathways require separate safeguarding).</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Security Architecture</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                Enterprise-grade tenancy, authentication, and integration security models.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               {[
                 { label: 'Role-Based Access', status: 'Active' },
                 { label: 'Tenant Isolation', status: 'Active' },
                 { label: 'Encryption @ Rest', status: 'Pending' },
                 { label: 'OAuth Token Vault', status: 'Active' },
                 { label: 'MFA Support', status: 'Roadmap' },
                 { label: 'Audit Logging', status: 'Partial' },
                 { label: 'SSO/SAML', status: 'Roadmap' },
                 { label: 'OWASP AI Threats', status: 'Auditing' },
               ].map((item, i) => (
                 <div key={i} className="bg-surface/40 border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
                   <span className="text-sm text-text-muted font-medium">{item.label}</span>
                   <span className={cn(
                     "text-xs uppercase tracking-wider font-bold mt-2",
                     item.status === 'Active' ? "text-success" : 
                     item.status === 'Pending' ? "text-warning" : 
                     item.status === 'Partial' ? "text-primary" : "text-text-muted"
                   )}>{item.status}</span>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Compliance Governance</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                Compliance simulation controls disabled in Production Readiness Pass.
              </p>
            </div>
            
            <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl flex gap-3 text-warning">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Production Readiness Warning</h4>
                <p className="text-xs opacity-90 mt-1 leading-relaxed">
                  This app is currently in prototype/stabilisation mode. It is not ready for live users, organisation clients, payments, production notifications or sensitive data until Firebase Auth, Firestore Security Rules, role scopes, consent controls and privacy documentation are implemented.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-text-main mb-2">Evidence & Savings Engine</h2>
              <p className="text-sm text-text-muted max-w-3xl leading-relaxed">
                Validation requirements for the People Value Engine and internal scoring formulas.
              </p>
            </div>
            <div className="p-6 bg-surface/50 border border-white/[0.04] rounded-2xl">
              <h3 className="font-semibold text-text-main mb-4">Metric Validation Protocol</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-text-muted text-xs font-bold">1</div>
                  <div>
                    <h4 className="text-sm font-medium text-text-muted">Baseline Registration</h4>
                    <p className="text-xs text-text-muted">Record completely anonymous perceived workload before platform use.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-text-muted text-xs font-bold">2</div>
                  <div>
                    <h4 className="text-sm font-medium text-text-muted">Score Transparency</h4>
                    <p className="text-xs text-text-muted">Recovery Velocity Score must expose its underlying factors, not act as a black box AI opinion.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-primary text-xs font-bold ring-1 ring-primary/30">3</div>
                  <div>
                    <h4 className="text-sm font-medium text-text-muted">ROI Calculation</h4>
                    <p className="text-xs text-text-muted">Absenteeism cost reduction claims must explicitly carry "Estimated" labels until proven by 90-day pilot validation.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
