import React, { useState, useEffect } from 'react';
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Sparkles, Activity, Shield, Target, Plus, Trash2, Edit2, AlertCircle } from 'lucide-react';
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
export const ConnectedDailyCheckIn = ({ onClose }: { onClose: () => void }) => {
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

  const db = getFirestore();
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
        note: note || undefined,
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
      <div className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
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
                  history.map(item => (
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
                  ))
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
