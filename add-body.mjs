import fs from 'fs';

let content = `
// 3. Connected Body Check-In
export const ConnectedBodyCheckIn = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<string[]>([]);
  
  const db = getFirestore();
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
`;

fs.appendFileSync('src/components/ConnectedRecoveryModules.tsx', content);
