import fs from 'fs';

let content = `
// 5. Connected Goals
export const ConnectedGoals = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('recovery_time');
  
  const db = getFirestore();
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
`;

fs.appendFileSync('src/components/ConnectedRecoveryModules.tsx', content);
