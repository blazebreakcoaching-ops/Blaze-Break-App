import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { cn } from '../lib/utils';

// Pressure Pattern Capture - Trigger Journal's real new home, in plain
// language. The legacy Hub's copy ("Identify visual/verbal/structural
// vectors setting off defence cycles") and its "+15 pts" button label (never
// actually wired to a points award) are both gone; this is the same real
// capability with human wording. Writes to the same stress_triggers
// collection, now including the real `source` field (fixed in an earlier
// PR - it was being silently dropped before reaching Firestore).
//
// Deliberately does not duplicate the legacy Hub's keyword-matched script
// suggestion panel - that's effectively a second, ad-hoc copy of what
// boundary-pushback-engine.ts (used by Boundary Rehearsal, already real and
// tested) already does properly. Capturing what set this off is this
// component's one job.

const SOURCES = ['Meetings', 'People (Colleague/Client)', 'Message / Slack Tone', 'Scope / Deadline creep', 'Time of day (e.g. late night work)'];

type Severity = 'low' | 'medium' | 'high';
const SEVERITY_TO_NUMBER: Record<Severity, number> = { low: 3, medium: 6, high: 9 };

interface TriggerEntry {
  id: string;
  text: string;
  date: string;
  severity: number;
  source?: string;
}

export const PressurePatternCapture = () => {
  const [history, setHistory] = useState<TriggerEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState(SOURCES[0]);
  const [severity, setSeverity] = useState<Severity>('medium');
  const [notes, setNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const uid = auth.currentUser?.uid;

  const fetchHistory = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'stress_triggers'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      setError('You do not have permission to access this record.');
    }
  };
  useEffect(() => { fetchHistory(); }, [uid]);

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setDictationError("Speech recognition isn't supported in this browser.");
      setTimeout(() => setDictationError(null), 4000);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript) setNotes((prev) => (prev + ' ' + finalTranscript).trim());
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const handleSubmit = async () => {
    if (!uid || !notes.trim()) return;
    setLoading(true); setError('');
    const now = new Date().toISOString();
    try {
      await setDoc(doc(db, 'users', uid, 'stress_triggers', Date.now().toString()), {
        createdAt: now, updatedAt: now,
        text: notes.trim(), date: now,
        severity: SEVERITY_TO_NUMBER[severity], energyLevel: 50,
        source,
      });
      setNotes('');
      fetchHistory();
    } catch (e) {
      setError('This entry could not be saved.');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'stress_triggers', id)); fetchHistory(); }
    catch (e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
        <h4 className="font-bold text-sm">What set this off?</h4>

        <div className="space-y-2">
          <label htmlFor="pressure-source-select" className="text-xs font-bold block">Source</label>
          <select
            id="pressure-source-select"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full bg-card p-2 text-xs rounded border border-border"
          >
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold block">How much did it land?</label>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={cn(
                  'py-2 px-3 rounded-lg text-xs font-bold border capitalize',
                  severity === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-text-main'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="pressure-notes" className="text-xs font-bold">What happened</label>
            <button
              onClick={toggleRecording}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold',
                isRecording ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-surface text-text-muted border-border'
              )}
            >
              {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {isRecording ? 'Stop' : 'Voice'}
            </button>
          </div>
          {dictationError && <p role="alert" className="text-xs text-destructive">{dictationError}</p>}
          <textarea
            id="pressure-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Manager changed scope on Friday afternoon without extra time."
            rows={3}
            className="w-full bg-card p-2 text-xs rounded border border-border"
          />
        </div>

        <button onClick={handleSubmit} disabled={loading || !notes.trim()} className="btn-primary w-full py-2 text-xs">
          Save
        </button>
      </div>

      {history.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Recent entries</h4>
          {history.slice(0, 5).map((item) => (
            <div key={item.id} className="relative bg-card p-3 rounded-lg border border-border">
              <button onClick={() => handleDelete(item.id)} aria-label="Delete" className="absolute top-2 right-2">
                <Trash2 className="w-4 h-4 text-text-muted hover:text-destructive" />
              </button>
              <div className="text-[10px] uppercase tracking-widest font-black text-primary">{item.source}</div>
              <p className="text-xs text-text-main mt-1">{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
