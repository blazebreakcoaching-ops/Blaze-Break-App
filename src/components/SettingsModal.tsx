import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, CheckCircle2, User, Sliders, Settings2, MessageSquare, ShieldCheck, LogOut } from 'lucide-react';
import { UserProfileData } from '../types';
import { NotificationSettingsView } from './NotificationSettingsView';
import { FeatureFlagsView } from './FeatureFlagsView';
import { FeedbackForm } from './FeedbackForm';
import { SecuritySettingsView } from './SecuritySettingsView';
import { NovaStyleControl } from './NovaStyleControl';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';
import { secureApiFetch } from '../lib/secure-api';
import { useAuth } from '../lib/auth';
import { profileImageFileError, profileImageDimensions } from '../lib/profile-image-safety';

interface SettingsModalProps {
  profile: UserProfileData | undefined;
  onSave: (profile: UserProfileData) => Promise<void> | void;
  onClose: () => void;
  onOpenPrivacyCentre?: () => void;
}

export const SettingsModal = ({ profile, onSave, onClose, onOpenPrivacyCentre }: SettingsModalProps) => {
  const { logOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'experiments' | 'consent' | 'feedback'>('profile');
  const [formData, setFormData] = useState<UserProfileData>(profile || {
    fullName: '',
    role: '',
    organization: '',
    managerEmail: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUploadSeq = useRef(0);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState(false);
  // Rapid consent-toggle changes must be committed in order. A slow older
  // response must not overwrite the last choice the customer made.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const [deletionRequestStatus, setDeletionRequestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [marketingChoice, setMarketingChoice] = useState<boolean | null>(null);
  const [marketingStatus, setMarketingStatus] = useState<string | null>(null);
  const [marketingSaving, setMarketingSaving] = useState(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'consent' || !user || user.isAnonymous) return;
    let cancelled = false;
    secureApiFetch('/api/marketing/preferences')
      .then(async (res) => {
        if (!res.ok) throw new Error('Unavailable');
        return res.json();
      }).then((data) => {
        if (!cancelled) {
          setMarketingChoice(data.optedIn === true);
          setMarketingStatus(data.syncStatus ?? null);
          setMarketingError(null);
        }
      }).catch(() => {
        if (!cancelled) setMarketingError('Email preferences cannot be loaded right now.');
      });
    return () => { cancelled = true; };
  }, [activeTab, user?.uid]);

  const toggleMarketing = async () => {
    if (marketingChoice === null || marketingSaving) return;
    setMarketingSaving(true);
    setMarketingError(null);
    try {
      const res = await secureApiFetch('/api/marketing/preferences', {
        method: 'POST',
        data: { optedIn: !marketingChoice, source: 'settings' },
      });
      if (!res.ok) throw new Error('Could not save preference');
      const data = await res.json();
      setMarketingChoice(data.optedIn === true);
      setMarketingStatus(data.syncStatus ?? null);
    } catch {
      setMarketingError('Could not save your choice. Please try again or contact support.');
    } finally {
      setMarketingSaving(false);
    }
  };
  const dialogRef = useFocusTrap(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Permit retrying the exact same file after a validation/decode error.
    e.target.value = '';
    const current = ++imageUploadSeq.current;
    setImageUploadError(null);

    const problem = profileImageFileError(file.type, file.size);
    if (problem) {
      setImageUploadError(problem);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      if (current === imageUploadSeq.current) setImageUploadError('Could not read the photo. Please try another image.');
    };
    reader.onload = () => {
      if (current !== imageUploadSeq.current) return;
      const img = new Image();
      img.onerror = () => {
        if (current === imageUploadSeq.current) setImageUploadError('Could not open the photo. Please try another image.');
      };
      img.onload = () => {
        if (current !== imageUploadSeq.current) return;
        try {
          const size = profileImageDimensions(img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unavailable');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('Image conversion failed');
          setFormData(prev => ({ ...prev, avatarBase64: dataUrl }));
        } catch {
          setImageUploadError('This photo could not be processed. Try a smaller image.');
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
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

  const queueSave = (next: UserProfileData): Promise<void> => {
    const pending = saveQueueRef.current.catch(() => {}).then(() => onSave(next));
    saveQueueRef.current = pending;
    return pending;
  };

  const savePreference = (next: UserProfileData) => {
    setFormData(next);
    setSaved(false);
    setProfileSaveError(false);
    void queueSave(next).then(() => setSaved(true)).catch(() => {
      setSaved(false);
      setProfileSaveError(true);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile || !validate()) return;
    setSavingProfile(true);
    setSaved(false);
    setProfileSaveError(false);
    try {
      await queueSave(formData);
      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1500);
    } catch {
      setProfileSaveError(true);
    } finally {
      setSavingProfile(false);
    }
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
        {profileSaveError && (
          <div role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Your changes were not saved. Please check your connection and try again.
          </div>
        )}
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
        <div role="tablist" className="flex border-b border-border dark:border-border mb-6 overflow-x-auto gap-2 shrink-0 pr-10">
          <button
            role="tab"
            aria-selected={activeTab === 'profile'}
            id="settings-tab-profile"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('profile')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap",
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
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap",
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
            aria-selected={activeTab === 'security'}
            id="settings-tab-security"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('security')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap",
              activeTab === 'security' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <ShieldCheck className="w-4 h-4" /> Security
            {activeTab === 'security' && (
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
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap",
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
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap",
              activeTab === 'experiments' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <Settings2 className="w-4 h-4" /> Feature Flags
            {activeTab === 'experiments' && (
              <motion.div layoutId="setting-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'feedback'}
            id="settings-tab-feedback"
            aria-controls="settings-panel"
            onClick={() => setActiveTab('feedback')}
            className={cn(
              "pb-3.5 px-4 text-xs font-black uppercase tracking-widest relative cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap",
              activeTab === 'feedback' ? "text-primary dark:text-primary" : "text-text-muted hover:text-text-main dark:hover:text-text-muted"
            )}
          >
            <MessageSquare className="w-4 h-4" /> Feedback &amp; Testimonials
            {activeTab === 'feedback' && (
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
                  <input type="file" ref={fileInputRef} className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                    onChange={handleImageUpload} aria-describedby={imageUploadError ? 'settings-photo-error' : undefined} />
                </div>
                {imageUploadError && (
                  <p id="settings-photo-error" role="alert"
                    className="text-xs text-destructive text-center -mt-4">
                    {imageUploadError}
                  </p>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="settings-fullname" className="text-xs font-black uppercase tracking-widest text-text-muted px-1">Full Name <span className="text-destructive dark:text-[#f87171]">*</span></label>
                    <input
                      id="settings-fullname"
                      type="text"
                      value={formData.fullName}
                      onChange={e => {
                        setFormData({...formData, fullName: e.target.value});
                        if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                      }}
                      aria-invalid={!!errors.fullName}
                      aria-describedby={errors.fullName ? "settings-fullname-error" : undefined}
                      className={cn(
                        "w-full bg-surface dark:bg-surface/50 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500 text-text-main",
                        errors.fullName
                          ? "border-destructive/50 focus:border-destructive focus:ring-2 focus:ring-destructive/20"
                          : "border-border dark:border-border focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/20"
                      )}
                    />
                    {errors.fullName && <p id="settings-fullname-error" role="alert" className="text-xs text-destructive dark:text-[#f87171] px-1 font-medium">{errors.fullName}</p>}
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
                      <label htmlFor="settings-org" className="text-xs font-black uppercase tracking-widest text-text-muted px-1">Organisation</label>
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
                      placeholder="Optional — no automatic alerts sent"
                      onChange={e => {
                        setFormData({...formData, managerEmail: e.target.value});
                        if (errors.email) setErrors({ ...errors, email: undefined });
                      }}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "settings-manager-email-error" : undefined}
                      className={cn(
                        "w-full bg-surface dark:bg-surface/50 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500 text-text-main",
                        errors.email
                          ? "border-destructive/50 focus:border-destructive focus:ring-2 focus:ring-destructive/20"
                          : "border-border dark:border-border focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/20"
                      )}
                    />
                    {errors.email ? (
                      <p id="settings-manager-email-error" role="alert" className="text-xs text-destructive dark:text-[#f87171] px-1 font-medium">{errors.email}</p>
                    ) : (
                      <p className="text-[11px] text-text-muted italic px-1 pt-1">
                        This is optional profile information. Blaze Break will not automatically contact this person or send wellbeing alerts.
                      </p>
                    )}
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={saved || savingProfile}
                  className={cn(
                    "w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest mt-4 flex items-center justify-center gap-2 transition-all cursor-pointer",
                    saved 
                      ? "bg-success text-white" 
                      : "btn-primary dark:bg-primary dark:hover:bg-primary dark:text-primary-foreground"
                  )}
                >
                  {saved ? (
                    <><CheckCircle2 className="w-4 h-4" /> Saved</>
                  ) : savingProfile ? "Saving…" : "Save Profile"}
                </button>
              </form>
            </div>
          ) : activeTab === 'notifications' ? (
            <div className="py-2">
              <NotificationSettingsView />
            </div>
          ) : activeTab === 'security' ? (
            <div className="py-2">
              <SecuritySettingsView />
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
                    className="text-xs font-bold text-[#9a3412] dark:text-primary hover:underline"
                  >
                    Open full Privacy Centre &rarr;
                  </button>
                )}
              </div>

              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-text-main">Optional email updates</h4>
                    <p className="text-xs text-text-muted mt-1">
                      News, practical tips and offers. Separate from account and security emails.
                    </p>
                  </div>
                  <button type="button" role="switch" aria-label="Optional marketing emails"
                    aria-checked={marketingChoice === true}
                    disabled={marketingChoice === null || marketingSaving}
                    onClick={() => { void toggleMarketing(); }}
                    className={cn("w-12 h-7 rounded-full relative shrink-0 disabled:opacity-50", marketingChoice ? "bg-success" : "bg-surface border border-border")}>
                    <span className={cn("block absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all", marketingChoice ? "left-6" : "left-1")} />
                  </button>
                </div>
                {marketingError && <p role="alert" className="text-xs text-destructive">{marketingError}</p>}
                {marketingStatus && marketingChoice === true && marketingStatus !== 'synced' && (
                  <p role="status" className="text-xs text-text-muted">
                    Preference saved; email updates will start after verification and list activation.
                  </p>
                )}
                {marketingChoice === false && marketingStatus &&
                  !['unsubscribed', 'not_subscribed'].includes(marketingStatus) && (
                  <p role="status" className="text-xs text-text-muted">
                    Opt-out recorded. List removal needs confirmation before sending campaigns.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {/* Card 1 */}
                 <div className="border border-border dark:border-border rounded-xl p-4 space-y-3">
                   <div className="flex items-center justify-between">
                     <h4 className="text-sm font-bold text-text-main">Use Name</h4>
                     <button onClick={() => {
                        const next = { ...formData, useNameInGreetings: formData.useNameInGreetings === false ? true : false };
                        savePreference(next);
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
                        savePreference(next);
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
                        savePreference(next);
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
                        savePreference(next);
                     }} role="switch" aria-checked={formData.sendNovaNudges !== false} aria-label="Nova Nudges" className={cn("w-10 h-6 rounded-full transition-colors relative", formData.sendNovaNudges !== false ? "bg-success" : "bg-surface dark:bg-surface")}>
                        <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", formData.sendNovaNudges !== false ? "left-5" : "left-1")} />
                     </button>
                   </div>
                   <p className="text-xs text-text-muted">Receive supportive reminders.</p>
                 </div>

                 {/* Card 5 - Nova Questioning Style */}
                 <div className="col-span-1 md:col-span-2 border border-border dark:border-border rounded-xl p-4 space-y-3">
                   <div className="flex items-center justify-between gap-4 flex-wrap">
                     <div>
                       <h4 className="text-sm font-bold text-text-main">Nova's Questioning Style</h4>
                       <p className="text-xs text-text-muted mt-1">Changes how Nova asks - never who Nova is. Off by default; applies to text chat and voice.</p>
                     </div>
                     <NovaStyleControl
                       value={formData.questioningStyle}
                       onChange={(style) => {
                         // Firestore rejects an explicit `undefined` field value
                         // outright, so "Off" persists as `null`, not `style` as-is.
                         const next = { ...formData, questioningStyle: style ?? null };
                         savePreference(next);
                       }}
                     />
                   </div>
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
                       setDeletionRequestStatus('sending');
                       try {
                         await secureApiFetch('/api/support/request', { method: 'POST', data: { type: 'deletion', details: 'User-initiated vault deletion request.' }});
                         setDeletionRequestStatus('sent');
                       } catch(e) {
                         setDeletionRequestStatus('error');
                       }
                     }}
                     disabled={deletionRequestStatus === 'sending'}
                     className="w-full sm:w-auto px-6 py-2.5 bg-surface hover:bg-border text-text-main text-xs font-bold uppercase tracking-widest rounded-lg transition-colors border border-border flex items-center justify-center cursor-pointer disabled:opacity-50"
                   >
                     {deletionRequestStatus === 'sending' ? 'Sending...' : 'Submit Deletion Request'}
                   </button>
                   {deletionRequestStatus === 'sent' && (
                     <p role="status" className="text-xs font-semibold text-success dark:text-[#4ade80]">Request sent securely. You'll receive an email shortly.</p>
                   )}
                   {deletionRequestStatus === 'error' && (
                     <p role="alert" className="text-xs font-semibold text-destructive dark:text-[#f87171]">Couldn't send that request. You can also email us directly at support@blazebreak.app</p>
                   )}
                 </div>
              </div>
            </div>
          ) : activeTab === 'experiments' ? (
            <div className="py-2">
              <FeatureFlagsView />
            </div>
          ) : (
            <div className="py-2">
              <FeedbackForm />
            </div>
          )}
        </div>

        {/* Persistent, always-visible regardless of which tab is open -
            there was previously no way to sign out of the app on demand
            anywhere in Settings (only narrow, conditional cases elsewhere
            like right after disabling 2FA), which made it impossible to
            cleanly switch accounts. */}
        <div className="shrink-0 pt-4 mt-2 border-t border-border dark:border-border">
          <button
            type="button"
            onClick={() => { logOut(); onClose(); }}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors py-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </motion.div>
    </div>
  );
};

