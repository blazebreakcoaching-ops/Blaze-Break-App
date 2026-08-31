import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { Shield, Brain, Trash2, Edit2, AlertCircle, RefreshCw } from 'lucide-react';
import { collection, query, getDocs, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function MemoryCentre() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  useEffect(() => {
    if (user) {
      loadMemories();
    }
  }, [user]);

  const getMemoriesRef = () => collection(db, 'users', user!.uid, 'nova_memories');

  const loadMemories = async () => {
    try {
      const q = query(getMemoriesRef());
      const snap = await getDocs(q);
      const mems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMemories(mems.filter((m: any) => !m.revoked));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(getMemoriesRef(), id));
      setMemories(mems => mems.filter(m => m.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm("Are you sure you want to forget ALL memories?")) return;
    try {
      const q = query(getMemoriesRef());
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setMemories([]);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setEditVal(m.content);
  };

  const saveEdit = async (m: any) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(getMemoriesRef(), m.id), { content: editVal, updatedAt: now });
      setMemories(mems => mems.map(me => me.id === m.id ? { ...me, content: editVal, updatedAt: now } : me));
      setEditingId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <div className="p-4"><RefreshCw className="animate-spin w-5 h-5 text-text-muted" /></div>;

  return (
    <div className="bg-card border border-border/10 rounded-2xl p-6 text-text">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-medium font-sans flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> Memory Centre
          </h2>
          <p className="text-sm text-text-muted mt-1 max-w-lg">
            Nova remembers only what you explicitly approve. These coaching preferences and patterns help personalise your recovery guidance without exposing raw private data.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-full text-xs font-medium border border-success/20">
          <Shield className="w-3.5 h-3.5" />
          <span>Privacy Controlled</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-destructive/10 text-destructive dark:text-[#f87171] text-sm rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {memories.length === 0 ? (
        <div className="p-8 text-center bg-background rounded-xl border border-dashed border-border/20">
          <Brain className="w-8 h-8 text-text-muted/30 mx-auto mb-3" />
          <p className="text-text-muted text-sm relative z-10">Nova currently has no active memories.</p>
          <p className="text-xs text-text-muted/70 mt-1 relative z-10">As you talk to Nova, it may suggest helpful preferences to remember.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button 
              onClick={handlePurge}
              className="text-xs text-destructive dark:text-[#f87171] hover:text-destructive/80 font-medium flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Forget all Nova memories
            </button>
          </div>
          
          {memories.map(m => (
            <div key={m.id} className="p-4 bg-background border border-border/10 rounded-xl relative group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-[#9a3412] dark:text-primary uppercase tracking-wider">
                  {m.type.replace(/_/g, ' ')}
                </span>
                
                <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-2 z-10 relative">
                  {(editingId !== m.id) && (
                     <button onClick={() => startEdit(m)} aria-label={`Edit memory: ${m.type.replace(/_/g, ' ')}`} className="p-1 text-text-muted hover:text-primary transition-colors" title="Edit">
                       <Edit2 className="w-3.5 h-3.5" />
                     </button>
                  )}
                  <button onClick={() => handleDelete(m.id)} aria-label={`Forget memory: ${m.type.replace(/_/g, ' ')}`} className="p-1 text-text-muted hover:text-destructive transition-colors" title="Forget this">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              {editingId === m.id ? (
                <div className="mt-2 space-y-2 relative z-10">
                  <input 
                    type="text" 
                    value={editVal} 
                    onChange={e => setEditVal(e.target.value)} 
                    maxLength={300}
                    className="w-full bg-card border border-border/20 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary/50" 
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 text-text-muted hover:text-text transition-colors">Cancel</button>
                    <button onClick={() => saveEdit(m)} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium pr-12 relative z-10">{m.content}</p>
              )}
              
              {(m.source || m.confidence) && (
                <p className="text-xs text-text-muted mt-2 border-t border-border/5 pt-2 relative z-10">
                  {m.source && <span>{m.source}</span>}
                  {m.source && m.confidence && <span> · </span>}
                  {m.confidence && <span className="capitalize">{m.confidence} confidence</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
