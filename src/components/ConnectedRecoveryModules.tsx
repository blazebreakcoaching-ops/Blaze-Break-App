import React, { useState, useEffect } from 'react';
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Sparkles, Activity, Shield, Target, Plus, Trash2, Edit2, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

// Helper for empty states
const SecureVaultNotice = () => (
  <div className="bg-primary/5 text-primary text-xs p-3 rounded-lg border border-primary/20 mb-4 flex gap-2">
    <Shield className="w-4 h-4 shrink-0" />
    <span>Secure vault starts fresh. Prototype demo history is not imported.</span>
  </div>
);

// Helper for error states
const ErrorMessage = ({ msg }: { msg: string }) => {
  if (!msg) return null;
  return (
    <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 mb-4 flex gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{msg}</span>
    </div>
  );
};

// 1. Connected Daily Check-In
export const ConnectedDailyCheckIn = ({ onClose, onReviewWithNova }: { onClose: () => void, onReviewWithNova?: () => void }) => {
  const [step, setStep] = useState(0);
  const [energyLevel, setEnergy] = useState(5);
  const [focusLevel, setFocus] = useState(5);
  const [detachmentLevel, setDetachment] = useState(5);
  const [stressLoad, setStress] = useState(5);
  const [note, setNote] = useState('');
  
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  
  const uid = auth.currentUser?.uid;

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'checkins'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      if (e.code === 'permission-denied') setError('You do not have permission to access this record.');
      else setError('Please check your connection and try again.');
    }
  };

  useEffect(() => { fetchHistory(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid) return;
    setLoading(true); setError('');
    try {
      const docId = editingId || Date.now().toString();
      const ref = doc(db, 'users', uid, 'checkins', docId);
      const data = {
        updatedAt: new Date().toISOString(),
        energyLevel, focusLevel, detachmentLevel, stressLoad,
        ...(note ? { note } : {}),
        source: 'user'
      };
      if (editingId) {
        await updateDoc(ref, data);
      } else {
        await setDoc(ref, { createdAt: new Date().toISOString(), ...data });
      }
      setStep(0);
      setEditingId(null);
      setNote('');
      fetchHistory();
    } catch (e: any) {
      console.error("Check-in save error:", e);
      setError('This entry could not be saved.');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'checkins', id));
      fetchHistory();
    } catch (e) { setError('This entry could not be saved.'); } // Using generic error per prompt
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setEnergy(item.energyLevel);
    setFocus(item.focusLevel);
    setDetachment(item.detachmentLevel);
    setStress(item.stressLoad);
    setNote(item.note || '');
    setStep(1); // Go to form
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-card/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-text-main">Daily Check-In (Secure)</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full text-text-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <SecureVaultNotice />
          <ErrorMessage msg={error} />
          
          {step === 0 && (
            <div className="space-y-6">
              <button onClick={() => { setStep(1); setEditingId(null); }} className="w-full btn-primary py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> New Check-In
              </button>
              
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Recent Check-Ins</h4>
                {history.length === 0 ? (
                  <p className="text-sm text-text-muted italic">Not enough data yet for trends.</p>
                ) : (
                  <>
                    {history.map(item => (
                      <div key={item.id} className="p-4 bg-surface rounded-xl border border-border">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(item)}><Edit2 className="w-4 h-4 text-text-muted hover:text-primary" /></button>
                            <button onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Energy: <span className="font-bold">{item.energyLevel}/10</span></div>
                          <div>Focus: <span className="font-bold">{item.focusLevel}/10</span></div>
                          <div>Detachment: <span className="font-bold">{item.detachmentLevel}/10</span></div>
                          <div>Stress: <span className="font-bold">{item.stressLoad}/10</span></div>
                        </div>
                      </div>
                    ))}
                    {onReviewWithNova && (
                      <button onClick={onReviewWithNova} className="w-full mt-4 py-3 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:bg-primary/20">
                        <Sparkles className="w-4 h-4" /> Review with Nova
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              {[
                { label: 'Energy Level (1-10)', val: energyLevel, set: setEnergy },
                { label: 'Focus Level (1-10)', val: focusLevel, set: setFocus },
                { label: 'Detachment Level (1-10)', val: detachmentLevel, set: setDetachment },
                { label: 'Stress Load (1-10)', val: stressLoad, set: setStress }
              ].map(f => (
                <div key={f.label} className="space-y-2">
                  <label className="text-xs font-bold text-text-muted">{f.label}</label>
                  <input type="range" min="1" max="10" value={f.val} onChange={e => f.set(parseInt(e.target.value))} className="w-full" />
                  <div className="text-center text-sm font-bold text-primary">{f.val}</div>
                </div>
              ))}
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-muted">Note (optional, max 300 chars)</label>
                <textarea maxLength={300} value={note} onChange={e => setNote(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-text-main" rows={3} />
              </div>
              <ErrorMessage msg={error} />
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="flex-1 py-3 text-sm font-bold text-text-muted">Cancel</button>
                <button onClick={handleSubmit} disabled={loading} className="flex-[2] btn-primary py-3 rounded-xl text-sm font-bold">
                  {loading ? 'Saving...' : 'Save Check-In'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 2. Connected Mood Pulse
export const ConnectedMoodPulse = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState('calm');
  const [intensity, setIntensity] = useState(5);
  
  
  const uid = auth.currentUser?.uid;
  const MOODS = ['calm', 'tired', 'pressured', 'frustrated', 'hopeful', 'flat', 'focused', 'overwhelmed'];

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'mood_pulses'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'mood_pulses', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        moodLabel: mood,
        intensity,
        source: 'user'
      });
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  const handleDelete = async(id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'mood_pulses', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">Log New Pulse</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {MOODS.map(m => (
            <button key={m} onClick={() => setMood(m)} className={cn("p-2 text-xs rounded-lg border", mood === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-text-main capitalize")}>{m}</button>
          ))}
        </div>
        <div>
          <label className="text-xs text-text-muted font-bold block mb-2">Intensity: {intensity}/10</label>
          <input type="range" min="1" max="10" value={intensity} onChange={e => setIntensity(parseInt(e.target.value))} className="w-full" />
        </div>
        <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full py-2 text-xs">Save Pulse</button>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Recent Pulses</h4>
        {history.map(item => (
          <div key={item.id} className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
            <div>
              <div className="text-sm font-bold capitalize">{item.moodLabel} <span className="text-primary font-normal text-xs">(Int: {item.intensity})</span></div>
              <div className="text-[10px] text-text-muted">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
            <button onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// 3. Connected Body Check-In
export const ConnectedBodyCheckIn = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<string[]>([]);
  
  
  const uid = auth.currentUser?.uid;
  const SIGNALS = ['jaw_tension', 'shoulder_tension', 'shallow_breathing', 'headache', 'fatigue', 'restlessness', 'stomach_discomfort', 'calm_settled'];

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'body_checkins'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const toggle = (s: string) => setSignals(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleSubmit = async () => {
    if (!uid || signals.length === 0) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'body_checkins', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        signals,
        source: 'user'
      });
      setSignals([]);
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  const handleDelete = async (id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'body_checkins', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      <div className="bg-primary/5 text-primary text-[10px] p-2 rounded text-center uppercase tracking-widest font-bold">
        Self-reported body check-in, not a medical measurement.
      </div>
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">Select Active Signals</h4>
        <div className="grid grid-cols-2 gap-2">
          {SIGNALS.map(s => (
            <button key={s} onClick={() => toggle(s)} className={cn("p-2 text-xs rounded-lg border", signals.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-text-main capitalize")}>{s.replace('_', ' ')}</button>
          ))}
        </div>
        <button onClick={handleSubmit} disabled={loading || signals.length === 0} className="btn-primary w-full py-2 text-xs">Save Body Scan</button>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Recent Scans</h4>
        {history.map(item => (
          <div key={item.id} className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
            <div>
              <div className="text-xs font-mono">{item.signals.map((s: string) => s.replace('_', ' ')).join(', ')}</div>
              <div className="text-[10px] text-text-muted">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
            <button onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// 4. Connected Wins Log
export const ConnectedWinsLog = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [contentStr, setContentStr] = useState('');
  const [category, setCategory] = useState('recovery_action');
  
  
  const uid = auth.currentUser?.uid;
  const CATEGORIES = ['boundary', 'rest', 'clarity', 'courage', 'routine', 'connection', 'recovery_action'];

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'wins'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid || !title || !contentStr) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'wins', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title, content: contentStr, category
      });
      setTitle(''); setContentStr('');
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  const handleDelete = async (id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'wins', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">Log New Recovery Win</h4>
        <input type="text" maxLength={80} placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" />
        <textarea maxLength={300} placeholder="Description" value={contentStr} onChange={e=>setContentStr(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={3}></textarea>
        <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border capitalize">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={handleSubmit} disabled={loading || !title || !contentStr} className="btn-primary w-full py-2 text-xs">Save Win</button>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Past Wins</h4>
        {history.map(item => (
          <div key={item.id} className="relative bg-card p-4 rounded-lg border border-border">
            <button onClick={() => handleDelete(item.id)} className="absolute top-2 right-2"><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
            <div className="text-xs uppercase tracking-widest font-black text-primary mb-1">{item.category}</div>
            <div className="font-bold text-sm">{item.title}</div>
            <div className="text-xs text-text-muted mt-1">{item.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 5. Connected Goals
export const ConnectedGoals = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('recovery_time');
  
  
  const uid = auth.currentUser?.uid;
  const CATEGORIES = ['sleep', 'boundaries', 'workload', 'nutrition_rhythm', 'movement', 'reflection', 'recovery_time'];

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'goals'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid || !title) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'goals', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title, category, status: 'active'
      });
      setTitle('');
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  
  const handleUpdateStatus = async (id: string, status: string) => {
    if(!uid) return;
    try { await updateDoc(doc(db, 'users', uid, 'goals', id), { status, updatedAt: new Date().toISOString() }); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };
  
  const handleDelete = async (id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'goals', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">Create Recovery Goal</h4>
        <div className="flex gap-2">
          <input type="text" maxLength={100} placeholder="I will..." value={title} onChange={e=>setTitle(e.target.value)} className="flex-1 bg-card p-2 text-xs rounded border border-border" />
          <select value={category} onChange={e=>setCategory(e.target.value)} className="w-32 bg-card p-2 text-xs rounded border border-border capitalize">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={handleSubmit} disabled={loading || !title} className="btn-primary w-full py-2 text-xs">Save Goal</button>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Your Goals</h4>
        {history.map(item => (
          <div key={item.id} className="relative bg-card p-3 rounded-lg border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
               <button onClick={() => handleUpdateStatus(item.id, item.status === 'completed' ? 'active' : 'completed')}>
                 {item.status === 'completed' ? <CheckCircle className="w-5 h-5 text-primary" /> : <Target className="w-5 h-5 text-text-muted" />}
               </button>
               <div>
                 <div className={cn("font-bold text-sm", item.status === 'completed' && "line-through text-text-muted")}>{item.title}</div>
                 <div className="text-[10px] text-text-muted uppercase tracking-widest">{item.category}</div>
               </div>
            </div>
            <div className="flex items-center gap-2">
              <select value={item.status} onChange={e => handleUpdateStatus(item.id, e.target.value)} className="text-xs p-1 bg-transparent border-none outline-none">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
              <button onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 6. Connected Nova Permissions
export const ConnectedNovaPermissions = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [perms, setPerms] = useState({
    allowCheckins: false,
    allowEnergyBudgets: false,
    allowMoodPulses: false,
    allowBodyCheckins: false,
    allowWins: false,
    allowWeeklyReviews: false,
    allowBoundaryScripts: false,
    allowGoals: false,
    allowRecoveryDebt: false,
    allowRecoveryVelocity: false,
    allowEnergyTrend: false,
    allowMoodTrend: false
  });
  
  
  const uid = auth.currentUser?.uid;

  const permissionsLabels: Record<string, string> = {
    allowCheckins: "Let Nova use my Check-ins",
    allowEnergyBudgets: "Let Nova use my Energy Budgets",
    allowMoodPulses: "Let Nova use my Mood Pulses",
    allowBodyCheckins: "Let Nova use my Body Check-ins",
    allowWins: "Let Nova use my Wins",
    allowWeeklyReviews: "Let Nova use my Weekly Reviews",
    allowBoundaryScripts: "Let Nova use my Boundary Scripts",
    allowGoals: "Let Nova use my Goals",
    allowRecoveryDebt: "Let Nova use my Recovery Debt summary",
    allowRecoveryVelocity: "Let Nova use my Recovery Velocity summary",
    allowEnergyTrend: "Let Nova use my Energy Trend",
    allowMoodTrend: "Let Nova use my Mood Trend"
  };

  const fetchPerms = async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'nova_permissions', 'current'));
      if (snap.exists()) {
        const data = snap.data() as any;
        setPerms(prev => ({
          ...prev,
          ...data
        }));
      }
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchPerms(); }, [uid]);

  const toggle = async (key: keyof typeof perms) => {
    if (!uid) return;
    setLoading(true); setError('');
    const newPerms = { ...perms, [key]: !perms[key], updatedAt: new Date().toISOString() };
    setPerms(newPerms);
    try {
      await setDoc(doc(db, 'users', uid, 'nova_permissions', 'current'), newPerms);
    } catch(e) { setError('This entry could not be saved.'); setPerms(perms); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-border pb-2">
        <h2 className="text-lg font-display font-medium text-text-main">Nova Privacy Controls</h2>
        <span className="text-xs text-text-muted">Turn off anytime</span>
      </div>
      <div className="bg-primary/5 text-primary text-xs p-3 rounded-lg border border-primary/20 mb-4 font-bold flex gap-2">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>Nova personalisation is limited to permitted compact summaries. Raw text remains excluded; memory remains disabled.</span>
      </div>
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-2">
        {Object.entries(perms).filter(([k]) => k !== 'updatedAt').map(([k, v]) => (
          <div key={k} className="flex justify-between items-center p-2.5 hover:bg-card rounded-lg transition-colors border-b border-border/5 last:border-b-0">
            <div>
              <span className="text-sm font-bold text-text-main block">{permissionsLabels[k] || k}</span>
              <span className="text-xs text-text-muted block mt-0.5">Summary-only consent</span>
            </div>
            <button onClick={() => toggle(k as any)} disabled={loading} className={cn("w-12 h-6 rounded-full transition-colors relative flex items-center shadow-inner", v ? "bg-primary" : "bg-border")}>
              <div className={cn("absolute w-4 h-4 rounded-full bg-white transition-transform shadow-sm", v ? "translate-x-7" : "translate-x-1")} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// 7. Connected Energy Budget
export const ConnectedEnergyBudget = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [periodType, setPeriodType] = useState('day');
  const [totalCapacity, setTotalCapacity] = useState(100);
  const [allocatedCapacity, setAllocatedCapacity] = useState(0);
  const [remainingCapacity, setRemainingCapacity] = useState(100);
  const [categories, setCategories] = useState<string[]>([]);
  const [note, setNote] = useState('');
  
  
  const uid = auth.currentUser?.uid;
  const CATS = ['work', 'family', 'social', 'admin', 'recovery'];

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'energy_budgets'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const toggle = (c: string) => setCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const handleSubmit = async () => {
    if (!uid) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'energy_budgets', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        periodType,
        totalCapacity,
        allocatedCapacity,
        remainingCapacity,
        categories,
        note
      });
      setCategories([]); setNote(''); setAllocatedCapacity(0); setRemainingCapacity(totalCapacity);
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  const handleDelete = async (id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'energy_budgets', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };
  
  useEffect(() => {
    setRemainingCapacity(totalCapacity - allocatedCapacity);
  }, [totalCapacity, allocatedCapacity]);

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">New Energy Budget</h4>
        <select value={periodType} onChange={e=>setPeriodType(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border">
          <option value="day">Daily</option><option value="week">Weekly</option>
        </select>
        
        <div><label className="text-xs font-bold">Total Capacity (0-100): {totalCapacity}</label>
        <input type="range" min="0" max="100" value={totalCapacity} onChange={e=>setTotalCapacity(parseInt(e.target.value))} className="w-full" /></div>
        
        <div><label className="text-xs font-bold">Allocated Capacity: {allocatedCapacity}</label>
        <input type="range" min="0" max="100" value={allocatedCapacity} onChange={e=>{
           const v = parseInt(e.target.value);
           if (v <= totalCapacity) setAllocatedCapacity(v);
        }} className="w-full" /></div>
        
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
           {CATS.map(c => <button key={c} onClick={()=>toggle(c)} className={cn("p-2 text-xs rounded-lg border capitalize", categories.includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border text-text-main")}>{c}</button>)}
        </div>
        
        <textarea maxLength={300} placeholder="Notes..." value={note} onChange={e=>setNote(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={2}></textarea>
        <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full py-2 text-xs">Save Budget</button>
      </div>

      <div className="space-y-3">
        {history.map(item => (
          <div key={item.id} className="relative bg-card p-3 rounded-lg border border-border">
            <button onClick={() => handleDelete(item.id)} className="absolute top-2 right-2"><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
            <div className="text-xs uppercase tracking-widest font-black text-primary mb-1">{item.periodType}</div>
            <div className="text-xs">Capacity: {item.totalCapacity} | Allocated: {item.allocatedCapacity} | Remaining: {item.remainingCapacity}</div>
            <div className="text-[10px] text-text-muted">{item.categories?.join(', ')}</div>
            {item.note && <div className="text-xs mt-1 text-text-muted border-t border-border pt-1">{item.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

// 8. Connected Boundary Scripts
export const ConnectedBoundaryScripts = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [scenarioType, setScenarioType] = useState('workload');
  const [scriptText, setScriptText] = useState('');
  const [status, setStatus] = useState('saved');
  
  
  const uid = auth.currentUser?.uid;
  const SCENARIOS = ['workload', 'family', 'client', 'manager', 'friend', 'personal'];

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'boundary_scripts'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid || !title || !scriptText) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'boundary_scripts', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title, scenarioType, scriptText, status
      });
      setTitle(''); setScriptText('');
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  
  const handleDelete = async (id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'boundary_scripts', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">New Boundary Script</h4>
        <input type="text" maxLength={80} placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" />
        <select value={scenarioType} onChange={e=>setScenarioType(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border capitalize">
          {SCENARIOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border capitalize">
          <option value="draft">Draft</option><option value="saved">Saved</option>
        </select>
        <textarea maxLength={500} placeholder="Script Text..." value={scriptText} onChange={e=>setScriptText(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={4}></textarea>
        
        <button onClick={handleSubmit} disabled={loading || !title || !scriptText} className="btn-primary w-full py-2 text-xs">Save Script</button>
      </div>

      <div className="space-y-3">
        {history.map(item => (
          <div key={item.id} className="relative bg-card p-4 rounded-lg border border-border">
            <button onClick={() => handleDelete(item.id)} className="absolute top-2 right-2"><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
            <div className="text-[10px] uppercase tracking-widest font-black text-primary mb-1 flex items-center justify-between">
              <span>{item.scenarioType}</span>
              <span className={cn(item.status === 'draft' ? "text-warning" : "text-success")}>{item.status}</span>
            </div>
            <div className="font-bold text-sm mb-2">{item.title}</div>
            <div className="text-xs whitespace-pre-wrap text-text-muted italic bg-surface p-2 rounded border border-border">"{item.scriptText}"</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 9. Connected Weekly Reviews
export const ConnectedWeeklyReviews = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [helped, setHelped] = useState('');
  const [drained, setDrained] = useState('');
  const [nextSmallStep, setNextSmallStep] = useState('');
  const [gratitude, setGratitude] = useState('');
  
  
  const uid = auth.currentUser?.uid;

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'weekly_reviews'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid || !helped || !drained || !nextSmallStep) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'weekly_reviews', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        weekStart: new Date(Date.now() - 7*86400000).toISOString(),
        weekEnd: new Date().toISOString(),
        helped, drained, nextSmallStep,
        ...(gratitude ? { gratitude } : {})
      });
      setHelped(''); setDrained(''); setNextSmallStep(''); setGratitude('');
      fetchHistory();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  
  const handleDelete = async (id: string) => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'weekly_reviews', id)); fetchHistory(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">New Weekly Review</h4>
        <textarea maxLength={300} placeholder="What helped recovery?..." value={helped} onChange={e=>setHelped(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={2}></textarea>
        <textarea maxLength={300} placeholder="What drained you?..." value={drained} onChange={e=>setDrained(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={2}></textarea>
        <textarea maxLength={200} placeholder="Next small step..." value={nextSmallStep} onChange={e=>setNextSmallStep(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={2}></textarea>
        <textarea maxLength={200} placeholder="Gratitude (optional)..." value={gratitude} onChange={e=>setGratitude(e.target.value)} className="w-full bg-card p-2 text-xs rounded border border-border" rows={1}></textarea>
        
        <button onClick={handleSubmit} disabled={loading || !helped || !drained || !nextSmallStep} className="btn-primary w-full py-2 text-xs">Save Review</button>
      </div>

      <div className="space-y-3">
        {history.length === 0 && <p className="text-sm text-text-muted italic">Not enough data yet for trends. Recovery trends will become available once secure scoring logic is implemented.</p>}
        {history.map(item => (
          <div key={item.id} className="relative bg-card p-4 rounded-lg border border-border space-y-2">
            <button onClick={() => handleDelete(item.id)} className="absolute top-2 right-2"><Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" /></button>
            <div className="text-[10px] text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</div>
            <div className="text-xs"><span className="font-bold text-success">Helped:</span> {item.helped}</div>
            <div className="text-xs"><span className="font-bold text-destructive">Drained:</span> {item.drained}</div>
            <div className="text-xs"><span className="font-bold text-primary">Next Step:</span> {item.nextSmallStep}</div>
            {item.gratitude && <div className="text-xs italic text-text-muted pt-2 border-t border-border mt-2">{item.gratitude}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

