import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, CheckCircle2, User, Sliders, Settings2 } from 'lucide-react';
import { UserProfileData } from '../types';
import { NotificationSettingsView } from './NotificationSettingsView';
import { FeatureFlagsView } from './FeatureFlagsView';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';

interface SettingsModalProps {
  profile: UserProfileData | undefined;
  onSave: (profile: UserProfileData) => void;
  onClose: () => void;
  onOpenPrivacyCentre?: () => void;
}

export const SettingsModal = ({ profile, onSave, onClose, onOpenPrivacyCentre }: SettingsModalProps) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'experiments' | 'consent'>('profile');
  const [formData, setFormData] = useState<UserProfileData>(profile || {
    fullName: '',
    role: '',
    organization: '',
    managerEmail: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const dialogRef = useFocusTrap(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 200;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setFormData(prev => ({ ...prev, avatarBase64: dataUrl }));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const validate = () => {
    const newErrors: { fullName?: string; email?: string } = {};
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }
    if (formData.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.managerEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    onSave(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-card/60 backdrop-blur-sm"
      />
      <motion.div
        ref={dialogRef as any}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        className="relative card w-full max-w-2xl p-8 overflow-hidden bg-white dark:bg-card max-h-[90vh] flex flex-col border border-border shadow-lg"
      >
        <AnimatePresence>
          {saved && (
            <motion.div
               role="status"
               aria-live="polite"
               initial={{ opacity: 0, y: -20, x: '-50%' }}
               animate={{ opacity: 1, y: 0, x: '-50%' }}
               exit={{ opacity: 0, y: -20, x: '-50%' }}
               className="absolute top-6 left-1/2 -translate-x-1/2 bg-success text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 z-50 text-sm font-bold border border-success"
            >
              <CheckCircle2 className="w-5 h-5" /> Settings Saved!
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-muted dark:hover:text-text-muted hover:bg-surface dark:bg-card dark:hover:bg-surface rounded-full transition-colors z-10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Header Selector */}
        <div role="tablist" className="flex border-b border-border dark:border-border mb-6 scrollbar-none gap-2 shrink-0">
          <button
            role="tab"
            aria-selected={activeTab === 'profile'}
            id="settings-tab-profile"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('profile')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2",
              activeTab === 'profile' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <User className="w-4 h-4" /> Profile Details
            {activeTab === 'profile' && (
              <motion.div layoutId="setting-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notifications'}
            id="settings-tab-notifications"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('notifications')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2",
              activeTab === 'notifications' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <Sliders className="w-4 h-4" /> Notification Shielding
            {activeTab === 'notifications' && (
              <motion.div layoutId="setting-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'consent'}
            id="settings-tab-consent"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('consent')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2",
              activeTab === 'consent' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <Settings2 className="w-4 h-4" /> Consent & Privacy
            {activeTab === 'consent' && (
              <motion.div layoutId="setting-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'experiments'}
            id="settings-tab-experiments"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('experiments')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2",
              activeTab === 'experiments' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <Settings2 className="w-4 h-4" /> Feature Flags
            {activeTab === 'experiments' && (
              <motion.div layoutId="setting-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>
        </div>

        {/* Scrollable Container Content */}
        <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} className="overflow-y-auto flex-1 pr-1 pb-2 space-y-6 scrollbar-thin scrollbar-thumb-border">
          {activeTab === 'profile' ? (
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-xl font-display font-bold text-text-main">Identity Settings</h3>
                <p className="text-xs text-text-muted">Update your private identity information. This is used to tailor your recovery plan.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center mb-6">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    aria-label={formData.avatarBase64 ? "Change profile photo" : "Upload profile photo"}
                    className="w-24 h-24 rounded-full bg-surface dark:bg-surface border border-border dark:border-border flex items-center justify-center cursor-pointer overflow-hidden relative group shadow-inner"
                  >
                    {formData.avatarBase64 ? (
                      <img src={formData.avatarBase64} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="w-6 h-6 text-text-muted group-hover:text-primary dark:group-hover:text-primary transition-colors" />
                    )}
                    <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center transition-all backdrop-blur-sm">
                       <span className="text-text-main text-xs font-bold uppercase tracking-wider">Change</span>
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="settings-fullname" className="text-xs font-black uppercase tracking-widest text-text-muted px-1">Full Name <span className="text-destructive">*</span></label>
                    <input
                      id="settings-fullname"
                      type="text"
                      value={formData.fullName}
                      onChange={e => {
                        setFormData({...formData, fullName: e.target.value});
                        if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                      }}
                      className={cn(
                        "w-full bg-surface dark:bg-surface/50 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500 text-text-main",
                        errors.fullName
                          ? "border-destructive/50 focus:border-destructive focus:ring-2 focus:ring-destructive/20"
                          : "border-border dark:border-border focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/20"
                      )}
                    />
                    {errors.fullName && <p role="alert" className="text-xs text-destructive px-1 font-medium">{errors.fullName}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="settings-role" className="text-xs font-black uppercase tracking-widest text-text-muted px-1">Job Role</label>
                      <input
                        id="settings-role"
                        type="text"
                        value={formData.role}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                        className="w-full bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder-slate-400 dark:placeholder-slate-500 text-text-main"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="settings-org" className="text-xs font-black uppercase tracking-widest text-text-muted px-1">Organization</label>
                      <input
                        id="settings-org"
                        type="text"
                        value={formData.organization}
                        onChange={e => setFormData({...formData, organization: e.target.value})}
                        className="w-full bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder-slate-400 dark:placeholder-slate-500 text-text-main"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="settings-manager-email" className="text-xs font-black uppercase tracking-widest text-text-muted px-1">Manager/HR Email (Optional)</label>
                    <input
                      id="settings-manager-email"
                      type="email"
                      value={formData.managerEmail}
                      placeholder="For proactive organizational resilience alerts"
                      onChange={e => {
                        setFormData({...formData, managerEmail: e.target.value});
                        if (errors.email) setErrors({ ...errors, email: undefined });
                      }}
                      className={cn(
                        "w-full bg-surface dark:bg-surface/50 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500 text-text-main",
                        errors.email
                          ? "border-destructive/50 focus:border-destructive focus:ring-2 focus:ring-destructive/20"
                          : "border-border dark:border-border focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/20"
                      )}
                    />
                    {errors.email ? (
                      <p role="alert" className="text-xs text-destructive px-1 font-medium">{errors.email}</p>
                    ) : (
                      <p className="text-[11px] text-text-muted italic px-1 pt-1">
                        We use this ONLY to send aggregated load warnings (predictive sick-leave) when nervous system debt is critical. Personal chat logs and medical fingerprint data are never exposed. Secrecy remains intact.
                      </p>
                    )}
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={saved}
                  className={cn(
                    "w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest mt-4 flex items-center justify-center gap-2 transition-all cursor-pointer",
                    saved 
                      ? "bg-success text-white" 
                      : "btn-primary dark:bg-primary dark:hover:bg-primary dark:text-primary-foreground"
                  )}
                >
                  {saved ? (
                    <><CheckCircle2 className="w-4 h-4" /> Identity Synced</>
                  ) : "Update Identity Profile"}
                </button>
              </form>
            </div>
          ) : activeTab === 'notifications' ? (
            <div className="py-2">
              <NotificationSettingsView />
            </div>
          ) : activeTab === 'consent' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-xl font-display font-bold text-text-main">Consent & Privacy</h3>
                <p className="text-xs text-text-muted">Manage how Nova interacts with your personal data and what permissions are granted.</p>
                {onOpenPrivacyCentre && (
                  <button
                    type="button"
                    onClick={onOpenPrivacyCentre}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Open full Privacy Centre &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {/* Card 1 */}
                 <div className="border border-border dark:border-border rounded-xl p-4 space-y-3">
                   <div className="flex items-center justify-between">
                     <h4 className="text-sm font-bold text-text-main">Use Name</h4>
                     <button onClick={() => {
                        const next = { ...formData, useNameInGreetings: formData.useNameInGreetings === false ? true : false };
                        setFormData(next);
                        onSave(next);
                     }} role="switch" aria-checked={formData.useNameInGreetings !== false} aria-label="Use Name" className={cn("w-10 h-6 rounded-full transition-colors relative", formData.useNameInGreetings !== false ? "bg-success" : "bg-surface dark:bg-surface")}>
                        <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", formData.useNameInGreetings !== false ? "left-5" : "left-1")} />
                     </button>
                   </div>
                   <p className="text-xs text-text-muted">Allow Nova to use your preferred name in greetings.</p>
                 </div>

                 {/* Card 2 */}
                 <div className="border border-border dark:border-border rounded-xl p-4 space-y-3">
                   <div className="flex items-center justify-between">
                     <h4 className="text-sm font-bold text-text-main">Local Context</h4>
                     <button onClick={() => {
                        const next = { ...formData, useLocalTime: formData.useLocalTime === false ? true : false };
                        setFormData(next);
                        onSave(next);
                     }} role="switch" aria-checked={formData.useLocalTime !== false} aria-label="Local Context" className={cn("w-10 h-6 rounded-full transition-colors relative", formData.useLocalTime !== false ? "bg-success" : "bg-surface dark:bg-surface")}>
                        <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", formData.useLocalTime !== false ? "left-5" : "left-1")} />
                     </button>
                   </div>
                   <p className="text-xs text-text-muted">Allow Nova to know your general region/timezone for context.</p>
                 </div>

                 {/* Card 3 */}
                 <div className="border border-border dark:border-border rounded-xl p-4 space-y-3">
                   <div className="flex items-center justify-between">
                     <h4 className="text-sm font-bold text-text-main">Behavioural Learning</h4>
                     <button onClick={() => {
                        const next = { ...formData, letNovaLearn: formData.letNovaLearn === false ? true : false };
                        setFormData(next);
                        onSave(next);
                     }} role="switch" aria-checked={formData.letNovaLearn !== false} aria-label="Behavioural Learning" className={cn("w-10 h-6 rounded-full transition-colors relative", formData.letNovaLearn !== false ? "bg-success" : "bg-surface dark:bg-surface")}>
                        <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", formData.letNovaLearn !== false ? "left-5" : "left-1")} />
                     </button>
                   </div>
                   <p className="text-xs text-text-muted">Allow Nova to learn from your daily check-ins and recovery actions.</p>
                 </div>

                 {/* Card 4 */}
                 <div className="border border-border dark:border-border rounded-xl p-4 space-y-3">
                   <div className="flex items-center justify-between">
                     <h4 className="text-sm font-bold text-text-main flex items-center gap-1"><Settings2 className="w-3 h-3"/> Nova Nudges</h4>
                     <button onClick={() => {
                        const next = { ...formData, sendNovaNudges: formData.sendNovaNudges === false ? true : false };
                        setFormData(next);
                        onSave(next);
                     }} role="switch" aria-checked={formData.sendNovaNudges !== false} aria-label="Nova Nudges" className={cn("w-10 h-6 rounded-full transition-colors relative", formData.sendNovaNudges !== false ? "bg-success" : "bg-surface dark:bg-surface")}>
                        <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", formData.sendNovaNudges !== false ? "left-5" : "left-1")} />
                     </button>
                   </div>
                   <p className="text-xs text-text-muted">Receive supportive reminders.</p>
                 </div>

                 {/* Support / Data Deletion */}
                 <div className="col-span-1 md:col-span-2 border border-border dark:border-border rounded-xl p-4 space-y-4">
                   <h4 className="text-sm font-bold text-text-main">
                     Account & Data Operations
                   </h4>
                   <p className="text-xs text-text-muted">
                     To request complete account and recovery vault deletion, report issues, or ask privacy questions, please alert our team. You will receive an email confirmation.
                   </p>
                   <button
                     onClick={async () => {
                       try {
                         const { secureApiFetch } = await import('../lib/secure-api');
                         await secureApiFetch('/api/support/request', { method: 'POST', data: { type: 'deletion', details: 'User-initiated vault deletion request.' }});
                         alert('Request sent securely. You will receive an email shortly.');
                       } catch(e) {
                         alert('Failed to send request. You can also email us directly at support@blazebreak.com');
                       }
                     }}
                     className="w-full sm:w-auto px-6 py-2.5 bg-surface hover:bg-border text-text-main text-xs font-bold uppercase tracking-widest rounded-lg transition-colors border border-border flex items-center justify-center cursor-pointer"
                   >
                     Submit Deletion Request
                   </button>
                 </div>
              </div>
            </div>
          ) : (
            <div className="py-2">
              <FeatureFlagsView />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

