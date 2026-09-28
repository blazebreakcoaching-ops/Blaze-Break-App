import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Trash2, BookMarked } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, doc, getDocs, addDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

// Sections 17-18: "Reflections worth keeping" and personal grounding
// statements. The person always decides what gets saved here - nothing
// is automatically labelled profound (section 17's explicit
// instruction). isUserCreated distinguishes a person's own words from
// something saved out of a session (an insight, a value, an aligned
// action, a question that landed), so a self-written statement is never
// mistaken in the UI for verified religious/curated content.
type SavedReflectionType = 'question' | 'insight' | 'value' | 'aligned_action' | 'grounding_statement' | 'faith_reflection';

interface SavedReflectionDoc {
  id: string;
  type: SavedReflectionType;
  text: string;
  isUserCreated: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<SavedReflectionType, string> = {
  question: 'A question', insight: 'An insight', value: 'A value',
  aligned_action: 'An aligned action', grounding_statement: 'A grounding statement', faith_reflection: 'A faith reflection',
};

export const GroundingSavedReflections = ({ onClose }: { onClose: () => void }) => {
  const [items, setItems] = useState<SavedReflectionDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');

  const load = async () => {
    if (!auth.currentUser) { setLoaded(true); return; }
    try {
      const snap = await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'savedReflections'), orderBy('createdAt', 'desc')));
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedReflectionDoc, 'id'>) })));
    } catch (e) {
      // Leaves the list empty rather than guessing at history.
    }
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const saveStatement = async () => {
    if (!auth.currentUser || !newText.trim()) return;
    await addDoc(collection(db, 'users', auth.currentUser.uid, 'savedReflections'), {
      type: 'grounding_statement', text: newText.trim().slice(0, 400), isUserCreated: true,
      createdAt: new Date().toISOString(),
    });
    setNewText('');
    setAdding(false);
    load();
  };

  const remove = async (id: string) => {
    if (!auth.currentUser) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    deleteDoc(doc(db, 'users', auth.currentUser.uid, 'savedReflections', id)).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl bg-card border border-border/40 rounded-2xl p-8 space-y-6 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display font-bold text-text-main">Reflections worth keeping</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-text-muted">Things you've chosen to hold onto - a question, an insight, a value, or a statement of your own.</p>

        {loaded && items.length === 0 && !adding && (
          <p className="text-sm text-text-muted py-4">Nothing saved yet. During a reflection, you can save a question or insight that landed - or add your own grounding statement below.</p>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="p-4 rounded-xl border border-border/20 bg-white/40 dark:bg-card/40 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-text-muted flex items-center gap-1.5">
                  <BookMarked className="w-3 h-3" /> {TYPE_LABELS[item.type]}{item.isUserCreated ? ' · your own words' : ''}
                </p>
                <p className="text-sm text-text-main mt-1">{item.text}</p>
              </div>
              <button onClick={() => remove(item.id)} aria-label="Remove" className="text-text-muted hover:text-destructive shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {!adding ? (
          <button onClick={() => setAdding(true)} className="px-5 py-2.5 bg-primary/10 text-[#9a3412] dark:text-primary rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Write your own grounding statement
          </button>
        ) : (
          <div className="space-y-3">
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value.slice(0, 400))}
              rows={2}
              autoFocus
              placeholder='e.g. "I am responsible for my effort, not every outcome."'
              className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setAdding(false); setNewText(''); }} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">Cancel</button>
              <button disabled={!newText.trim()} onClick={saveStatement} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40">Save</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
