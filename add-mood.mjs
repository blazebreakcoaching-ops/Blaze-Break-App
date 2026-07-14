import fs from 'fs';

let content = `
// 2. Connected Mood Pulse
export const ConnectedMoodPulse = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState('calm');
  const [intensity, setIntensity] = useState(5);
  
  const db = getFirestore();
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
`;

fs.appendFileSync('src/components/ConnectedRecoveryModules.tsx', content);
