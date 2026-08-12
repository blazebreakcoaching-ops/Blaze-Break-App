import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CrisisSupportContent } from './CrisisSupport';
import { secureApiFetch } from '../lib/secure-api';
import {
  Users, 
  ShieldCheck, 
  Trash2, 
  Send, 
  AlertTriangle,
  UserPlus,
  Shield,
  CheckCircle2,
  X,
  Eye,
  Loader2,
  Phone,
  Zap,
  HeartPulse,
  Sparkles,
  PhoneForwarded,
  Clock,
  Activity,
  Network
} from 'lucide-react';
import { SupportContact } from '../types';
import { cn } from '../lib/utils';

interface NovaGuardianRelayProps {
  contacts: SupportContact[];
  onAdd: (contact: Omit<SupportContact, 'id'>) => void;
  onRemove: (id: string) => void;
  userName?: string;
}

const GuardianCard = ({ 
  contact, 
  onRemove, 
  onSendTestAll, 
  onTriggerPrimaryRelay,
  onActivateSOS
}: { 
  contact: SupportContact; 
  onRemove: (id: string) => void;
  onSendTestAll: () => void;
  onTriggerPrimaryRelay: () => void;
  onActivateSOS: (id: string) => void;
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [isRelaying, setIsRelaying] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  
  const isSyncing = countdown !== null || isHealthChecking || isRelaying;
  const indicatorMode = (countdown !== null || isRelaying) ? 'emergency' : (isHealthChecking ? 'sync' : 'idle');

  const handleQuickRelay = () => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    setCountdown(3);
  };

  React.useEffect(() => {
    if (countdown === null) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) setCountdown(null);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (countdown === 0) {
      setCountdown(null);
      setIsRelaying(true);
      setTimeout(() => {
        setIsRelaying(false);
        onTriggerPrimaryRelay();
      }, 1000); // Brief "relaying" UI transition before the real call fires
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev !== null ? prev - 1 : null);
    }, 1000);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [countdown, onTriggerPrimaryRelay]);

  const handleHealthCheck = () => {
    setIsHealthChecking(true);
    setTimeout(() => {
      setIsHealthChecking(false);
      setLastHealthCheck(new Date());
      onSendTestAll();
    }, 1500);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "guardian-network-card p-6 rounded-2xl border transition-all overflow-hidden relative shadow-lg group",
        contact.role.includes('guardian')
          ? "bg-card border-destructive/30 text-destructive shadow-destructive/10"
          : "bg-white dark:bg-card border-border"
      )}
    >
      <div 
        className={cn(
          "absolute inset-0 border-2 rounded-2xl pointer-events-none transition-all rhythmic-heartbeat opacity-0 group-hover:opacity-100",
          "border-primary/10"
        )}
        style={{ '--animation-duration': '4s' } as React.CSSProperties}
      />
      
      {/* Real-time status indicator */}
      <div className={cn(
        "absolute top-5 right-5 flex items-center gap-2"
      )}>
         <span className="text-[11px] uppercase tracking-widest font-black text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
           {indicatorMode === 'emergency' ? 'CRITICAL' : indicatorMode === 'sync' ? 'SYNCING' : 'READY'}
         </span>
         <div className={cn(
           "w-2 h-2 rounded-full transition-all",
           indicatorMode === 'emergency' ? "bg-destructive shadow-[0_0_10px_rgba(244,63,94,0.8)]" : 
           indicatorMode === 'sync' ? "bg-warning shadow-[0_0_10px_rgba(245,158,11,0.5)]" : 
           "bg-success/40"
         )} />
      </div>

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-white/5", contact.role.includes('guardian') ? "bg-destructive/10 text-destructive" : "bg-surface dark:bg-surface text-text-muted shadow-inner")}>
          {contact.role === 'primary_guardian' ? <ShieldCheck className="w-5 h-5" /> : 
           contact.role === 'backup_guardian' ? <Shield className="w-5 h-5" /> : <Users className="w-5 h-5" />}
        </div>
        <button 
          onClick={() => onRemove(contact.id)}
          className="p-2 text-text-muted hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 mt-8 mr-2"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <div className="space-y-1.5 relative z-10 mb-6">
        <h4 className={cn("font-bold text-lg tracking-tight", contact.role.includes('guardian') ? "text-destructive" : "text-text-main")}>{contact.name}</h4>
        <div className="flex items-center gap-2 flex-wrap">
           <span className={cn(
             "text-[11px] uppercase font-black tracking-widest px-2.5 py-1 rounded-md",
             contact.role === 'primary_guardian' ? "bg-destructive/20 text-destructive" : "bg-border dark:bg-surface text-text-muted"
           )}>
             {contact.role.replace('_', ' ')}
           </span>
        </div>
      </div>

      <div className="space-y-4 relative z-10 border-t border-border/50 pt-4">
         <div className="flex items-center justify-between">
           <p className={cn("text-xs font-mono flex items-center gap-2", contact.role.includes('guardian') ? "text-text-muted" : "text-text-muted")}>
             <Phone className="w-3.5 h-3.5" /> {contact.contactMethod}
           </p>
           <div className="group/time relative flex items-center justify-end cursor-help text-text-muted hover:text-success transition-colors">
             <span className="absolute right-full mr-2 opacity-0 group-hover/time:opacity-100 transition-opacity text-[11px] uppercase tracking-widest font-black whitespace-nowrap pointer-events-none bg-card text-text-main px-2 py-1 rounded">
               {lastHealthCheck ? `Verified: ${lastHealthCheck.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Unverified'}
             </span>
             <Clock className="w-3.5 h-3.5" />
           </div>
         </div>
         
         <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => onActivateSOS(contact.id)}
              className={cn("col-span-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm", contact.role.includes('guardian') ? "bg-destructive hover:bg-destructive text-destructive-foreground" : "bg-white dark:bg-surface border border-destructive dark:border-destructive text-destructive dark:text-destructive hover:bg-destructive dark:hover:bg-destructive")}
            >
              Manual SOS
            </button>
            <button 
              onClick={handleHealthCheck}
              disabled={isSyncing}
              className="col-span-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all bg-success/10 text-success dark:text-success hover:bg-success/20 shadow-sm"
            >
              {isHealthChecking ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Ping Status"}
            </button>
            
            {/* Quick Relay */}
            <button 
              onClick={handleQuickRelay}
              className={cn(
                "col-span-2 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-2", 
                countdown !== null 
                  ? "bg-destructive text-destructive-foreground animate-pulse shadow-[0_0_20px_rgba(225,29,72,0.6)]" 
                  : contact.role.includes('guardian') ? "bg-primary text-primary-foreground hover:bg-primary-dark" : "bg-surface text-text-main"
              )}
            >
              {countdown !== null ? (
                <><AlertTriangle className="w-4 h-4" /> Abort Dispatch ({countdown}s)</>
              ) : isRelaying ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Transmitting...</>
              ) : (
                <><Zap className="w-4 h-4 text-warning" /> One-Touch Alert</>
              )}
            </button>
         </div>
      </div>
    </motion.div>
  );
};

export const NovaGuardianRelay = ({ contacts, onAdd, onRemove, userName }: NovaGuardianRelayProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newContact, setNewContact] = useState<Omit<SupportContact, 'id'>>({
    name: '',
    role: 'primary_guardian',
    isGuardian: true,
    contactMethod: '',
    relation: 'Partner',
    notificationPreference: 'sms',
    autoAlertEnabled: false
  });
  
  const [activeSOS, setActiveSOS] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newContact.name.trim() && newContact.contactMethod.trim()) {
      onAdd({ ...newContact, isGuardian: newContact.role.includes('guardian') });
      setNewContact({ name: '', role: 'peer', isGuardian: false, contactMethod: '', relation: 'Friend', notificationPreference: 'sms', autoAlertEnabled: false });
      setIsAdding(false);
    }
  };

  const sendTestAlertAll = async () => {
    setIsSending(true);
    setSendSuccess(null);
    const senderName = userName?.trim() || 'A Blaze Break user';
    const validContacts = contacts.filter(c => /^\+[1-9]\d{6,14}$/.test(c.contactMethod));

    if (validContacts.length === 0) {
      setSendSuccess(contacts.length === 0 ? "No guardians configured yet." : "No guardians have a valid phone number on file.");
      setTimeout(() => setSendSuccess(null), 3000);
      setIsSending(false);
      return;
    }

    try {
      const results = await Promise.all(validContacts.map(c =>
        secureApiFetch('/api/twilio/send', {
          method: 'POST',
          data: {
            to: c.contactMethod,
            message: `Nova Test: This is a test of ${senderName}'s Guardian Relay. No action needed - just confirming this contact method works.`,
            useWhatsapp: c.notificationPreference === 'whatsapp',
          },
        }).then(res => res.json()).then(body => body.success === true).catch(() => false)
      ));
      const successCount = results.filter(Boolean).length;
      setSendSuccess(successCount === validContacts.length
        ? `Test sent to all ${successCount} guardian(s).`
        : `Test sent to ${successCount} of ${validContacts.length} guardian(s) - check the rest.`);
      setTimeout(() => setSendSuccess(null), 4000);
    } finally {
      setTimeout(() => setIsSending(false), 800);
    }
  };

  const sendRealAlert = async (contact: SupportContact) => {
    setIsSending(true);
    const senderName = userName?.trim() || 'A Blaze Break user';
    const message = `Nova Alert: ${senderName} has asked for extra support right now. This message was sent because they manually requested it.`;

    if (!/^\+[1-9]\d{6,14}$/.test(contact.contactMethod)) {
      setSendSuccess("Couldn't send - this contact's number isn't in a valid format. Edit it and try again.");
      setTimeout(() => { setSendSuccess(null); setIsSending(false); }, 4000);
      return;
    }

    try {
      const res = await secureApiFetch('/api/twilio/send', {
        method: 'POST',
        data: {
          to: contact.contactMethod,
          message,
          useWhatsapp: contact.notificationPreference === 'whatsapp',
        },
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setSendSuccess(`Alert sent to ${contact.name}.`);
      } else {
        setSendSuccess(body.error || "Couldn't send that alert right now.");
      }
    } catch (e) {
      setSendSuccess("Couldn't reach the messaging service right now.");
    } finally {
      setTimeout(() => {
        setSendSuccess(null);
        setActiveSOS(null);
        setIsSending(false);
      }, 3000);
    }
  };

  const triggerLiveRelayToPrimary = async () => {
    const primary = contacts.find(c => c.role === 'primary_guardian') || contacts[0];
    if (!primary) {
      setSendSuccess("No guardian is set up yet - add one first.");
      setTimeout(() => setSendSuccess(null), 3000);
      return;
    }
    await sendRealAlert(primary);
  };

  const triggerLiveRelay = async (contact: SupportContact) => {
    await sendRealAlert(contact);
  };

  return (
    <div className="space-y-12 pb-12">
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8 sm:p-12">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Network className="w-64 h-64 text-text-muted" />
        </div>
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center shrink-0 shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
               <h2 className="text-3xl lg:text-4xl font-display font-bold text-text-main tracking-tight">Guardian Relay</h2>
               <p className="text-destructive text-xs font-black uppercase tracking-widest mt-2 flex items-center gap-2"><Activity className="w-3 h-3" /> Priority Access Subsystem</p>
            </div>
          </div>
          <p className="text-xl leading-relaxed text-text-muted font-medium italic border-l-2 border-destructive/50 pl-6 py-2">
            "When you can't reach out, Nova reaches in."
          </p>
          <p className="text-sm text-text-muted leading-relaxed max-w-2xl">
            A pre-set escalation network you control. Add trusted contacts once, then reach them in one tap whenever you need real support — nothing is monitored or triggered automatically, and your private details are never shared with your guardians.
          </p>
          
          <button 
            onClick={() => setIsAdding(true)}
            className="mt-6 flex items-center justify-center gap-3 px-8 py-4 bg-white text-text-main hover:bg-surface dark:bg-card rounded-xl text-xs font-black uppercase tracking-widest transition-all w-fit shadow-lg shadow-white/5"
          >
            <UserPlus className="w-4 h-4" /> Provision New Guardian
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Guardian Network List */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Active Guardian Nodes</h3>
            <span className="text-xs font-mono text-text-muted bg-surface dark:bg-surface px-3 py-1 rounded-full">{contacts.length} Configured</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {contacts.map((contact) => (
                <GuardianCard 
                  key={contact.id} 
                  contact={contact} 
                  onRemove={onRemove}
                  onSendTestAll={sendTestAlertAll}
                  onTriggerPrimaryRelay={triggerLiveRelayToPrimary}
                  onActivateSOS={setActiveSOS}
                />
              ))}
            </AnimatePresence>

            {contacts.length === 0 && !isAdding && (
               <div className="col-span-full py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl bg-surface dark:bg-card/50">
                 <Shield className="w-12 h-12 text-text-muted mb-6" />
                 <h4 className="font-bold text-text-main mb-2 text-lg">Infrastructure Offline</h4>
                 <p className="text-sm text-text-muted max-w-md px-6 mb-8 leading-relaxed">Set up your emergency contacts now, so there's a clear path to reach someone if things ever get to be too much.</p>
                 <button 
                   onClick={() => setIsAdding(true)}
                   className="flex items-center gap-3 btn-primary px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                 >
                   <UserPlus className="w-4 h-4" /> Add Contact
                 </button>
               </div>
            )}
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="xl:col-span-4 space-y-6">
          {/* Nova's Anchor: Grounding State */}
          <div className="card p-8 bg-card border border-border text-text-main relative overflow-hidden space-y-6">
            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <h4 className="font-bold uppercase tracking-widest text-xs tracking-[0.2em] text-primary">
                  Nova's Anchor
                </h4>
              </div>
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(234,88,12,0.8)]" />
            </div>

            <div className="relative z-10 space-y-5">
              <div className="p-6 bg-primary/10 rounded-2xl border border-primary/20 text-center space-y-6 shadow-inner">
                <p className="text-sm font-medium leading-relaxed italic text-primary-light">
                  "Your nervous system is overworked, not broken. The panic you feel is a biological false alarm, attempting to protect you from an invisible threat. We are safe in this exact moment."
                </p>
                <div className="pt-2">
                   <motion.div 
                     animate={{ scale: [1, 1.15, 1] }}
                     transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                     className="w-16 h-16 rounded-full border border-primary/30 mx-auto flex items-center justify-center text-primary relative shadow-[0_0_30px_rgba(234,88,12,0.2)]"
                   >
                     <motion.div 
                       animate={{ opacity: [0.5, 1, 0.5] }}
                       transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                       className="absolute inset-0 bg-primary/20 rounded-full blur-md"
                     />
                     <HeartPulse className="w-6 h-6 relative z-10" />
                   </motion.div>
                   <p className="text-xs uppercase tracking-[0.2em] font-black text-primary mt-6">Respiratory sync pattern</p>
                   <p className="text-[11px] font-mono text-primary mt-1">4.0s INHALATION // 4.0s EXHALATION</p>
                </div>
              </div>
            </div>
          </div>

          {/* Crisis support — shared content, see CrisisSupport.tsx */}
          <div className="card p-8 bg-card border-border relative overflow-hidden space-y-6 shadow-xl">
             <div className="relative z-10 flex items-center justify-between border-b border-border pb-4">
               <div className="flex items-center gap-3">
                 <PhoneForwarded className="w-5 h-5 text-primary" />
                 <h4 className="font-bold uppercase tracking-widest text-xs tracking-[0.2em] text-text-main">
                   Crisis support
                 </h4>
               </div>
             </div>
             <div className="relative z-10 pt-2">
                <CrisisSupportContent />
             </div>
          </div>
          <div className="card p-8 border border-border bg-card text-text-main relative overflow-hidden space-y-6 shadow-lg">
             <div className="relative z-10 flex items-center gap-3 border-b border-border pb-4">
               <Eye className="w-5 h-5 text-text-muted" />
               <h4 className="font-bold uppercase tracking-widest text-xs tracking-[0.2em] text-text-muted">Privacy Assertion</h4>
             </div>
             
             <div className="relative z-10 space-y-5 pt-2">
                <div className="space-y-2.5">
                  <h5 className="text-xs font-black uppercase tracking-widest text-success dark:text-success">Your Privacy, Protected</h5>
                  <p className="text-[11px] leading-relaxed text-text-muted">Your guardians only ever see that you've reached out — never your conversation history, journal entries, or any other private details.</p>
                </div>
                <div className="space-y-2.5">
                  <h5 className="text-xs font-black uppercase tracking-widest text-success">How It Works</h5>
                  <p className="text-[11px] leading-relaxed text-text-muted">This is entirely manual. Nova does not monitor you or decide when to alert anyone - your guardian is only ever contacted when you choose to reach out.</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Add Guardian Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
               className="relative card w-full max-w-xl p-8 overflow-hidden bg-white dark:bg-card border border-border shadow-lg"
            >
              <button 
                onClick={() => setIsAdding(false)}
                className="absolute top-6 right-6 p-2 text-text-muted hover:bg-surface dark:bg-card dark:hover:bg-surface rounded-lg transition-colors"
               >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-8">
                <div className="space-y-2 border-b border-border pb-6 pr-8">
                  <h3 className="text-2xl font-bold font-display text-text-main flex items-center gap-3">
                     <ShieldCheck className="w-6 h-6 text-primary" /> Add a Support Contact
                  </h3>
                  <p className="text-sm text-text-muted">Define the endpoint identity and access parameters for severe overload scenarios.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Identity Designation</label>
                      <input 
                        type="text" 
                        value={newContact.name}
                        onChange={e => setNewContact({...newContact, name: e.target.value})}
                        required
                        placeholder="e.g. Dr. Alex Morgan"
                        className="w-full bg-surface dark:bg-surface border border-border rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-sans"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Phone Number</label>
                      <input 
                        type="tel" 
                        value={newContact.contactMethod}
                        onChange={e => setNewContact({...newContact, contactMethod: e.target.value})}
                        required
                        pattern="^\+[1-9]\d{6,14}$"
                        title="Include the country code, e.g. +15551234567"
                        placeholder="+15551234567"
                        className="w-full bg-surface dark:bg-surface border border-border rounded-xl px-4 py-3.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                      />
                      <p className="text-[10px] text-text-muted ml-1">Include the country code (e.g. +1 for US/Canada, +44 for UK) so the alert can actually be sent.</p>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Contact Method</label>
                       <select
                         value={newContact.notificationPreference}
                         onChange={e => setNewContact({...newContact, notificationPreference: e.target.value as any})}
                         className="w-full bg-surface dark:bg-surface border border-border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                       >
                         <option value="sms">SMS</option>
                         <option value="whatsapp">WhatsApp</option>
                       </select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                       <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Hierarchical Security Role (Authorised Access Framework)</label>
                       <select 
                         value={newContact.role}
                         onChange={e => setNewContact({...newContact, role: e.target.value as any})}
                         className="w-full bg-surface dark:bg-surface border border-border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-sans"
                       >
                         <option value="primary_guardian">Primary Contact (Contacted First)</option>
                         <option value="backup_guardian">Secondary Sentinel (Failover Endpoint)</option>
                         <option value="coach">Therapist / Counselor</option>
                         <option value="peer" disabled>Peer Validator (Blocked by Zone D Privacy Rules)</option>
                         <option value="manager" disabled>Manager (Blocked by Zone A Privacy Isolation Rules)</option>
                       </select>
                       <p className="text-xs text-text-muted mt-2 ml-1">
                          Note: Under Authorised Access Framework Zone A, organizational managers and peers are strictly prohibited from receiving Guardian crisis intercepts.
                       </p>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-surface dark:bg-white text-text-main dark:text-foreground py-5 rounded-xl text-xs font-black uppercase tracking-[0.15em] mt-4 shadow-xl shadow-black/10 transition-all flex items-center justify-center gap-3 hover:scale-[1.01]"
                  >
                    Save Contact
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SOS Manual Modal */}
      <AnimatePresence>
        {activeSOS && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSending && setActiveSOS(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
               className="relative card w-full max-w-md p-0 overflow-hidden bg-card border border-destructive/30 text-text-main shadow-lg shadow-destructive/10"
            >
                <div className="p-8 space-y-6 relative z-10">
                  <div className="w-20 h-20 rounded-2xl bg-destructive/20 flex items-center justify-center mx-auto text-destructive border border-destructive/30 shadow-[0_0_30px_rgba(225,29,72,0.2)]">
                     <AlertTriangle className="w-10 h-10" />
                  </div>
                  <div className="text-center space-y-3">
                     <h3 className="text-2xl font-bold font-display line-clamp-1 text-text-main tracking-tight">Manual Dispatch</h3>
                     <p className="text-sm text-text-muted px-4 leading-relaxed">
                       Sending an alert to <strong className="text-text-main">"{contacts.find(c => c.id === activeSOS)?.name}"</strong>. They'll be asked to reach out to you as soon as possible.
                     </p>
                  </div>

                  <div className="p-5 bg-black/40 rounded-xl border border-border/50 shadow-inner">
                    <p className="text-[11px] font-mono leading-relaxed text-text-muted">
                      [PAYLOAD PREVIEW]<br/><br/>
                      "Nova Alert: {userName?.trim() || 'A Blaze Break user'} has asked for extra support right now. This message was sent because they manually requested it."
                    </p>
                  </div>

                  {sendSuccess ? (
                     <div className="py-6 text-center">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 className="w-8 h-8" />
                        </motion.div>
                        <h4 className="font-bold text-text-main uppercase tracking-widest text-sm">{sendSuccess}</h4>
                     </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <button 
                        onClick={() => setActiveSOS(null)}
                        disabled={isSending}
                        className="py-4 rounded-xl font-bold text-xs uppercase tracking-widest bg-card text-text-muted hover:bg-surface transition-colors disabled:"
                      >
                        Abort Sequence
                      </button>
                      <button 
                        onClick={() => {
                           const c = contacts.find(c => c.id === activeSOS);
                           if (c) triggerLiveRelay(c);
                        }}
                        disabled={isSending}
                        className="py-4 rounded-xl font-bold text-xs uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive transition-colors flex items-center justify-center gap-2 shadow-lg shadow-destructive/30 disabled:opacity-40"
                      >
                       {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 relative -left-0.5" /> Execute</>}
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-destructive/10 to-transparent pointer-events-none" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
