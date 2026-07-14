import fs from 'fs';

let content = `
// 4. Connected Wins Log
export const ConnectedWinsLog = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [contentStr, setContentStr] = useState('');
  const [category, setCategory] = useState('recovery_action');
  
  const db = getFirestore();
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
`;

fs.appendFileSync('src/components/ConnectedRecoveryModules.tsx', content);
