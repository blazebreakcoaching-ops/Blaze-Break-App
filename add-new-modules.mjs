import fs from 'fs';

const content = `
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
  
  const db = getFirestore();
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
  
  const db = getFirestore();
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
              <span className={cn(item.status === 'draft' ? "text-amber-500" : "text-emerald-500")}>{item.status}</span>
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
  
  const db = getFirestore();
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
        gratitude: gratitude || undefined
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
            <div className="text-xs"><span className="font-bold text-emerald-500">Helped:</span> {item.helped}</div>
            <div className="text-xs"><span className="font-bold text-destructive">Drained:</span> {item.drained}</div>
            <div className="text-xs"><span className="font-bold text-primary">Next Step:</span> {item.nextSmallStep}</div>
            {item.gratitude && <div className="text-xs italic text-text-muted pt-2 border-t border-border mt-2">{item.gratitude}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

// 10. Connected Burnout Fingerprint
export const ConnectedBurnoutFingerprint = () => {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [takingTest, setTakingTest] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState('High-Functioning Exhausted');
  
  const db = getFirestore();
  const uid = auth.currentUser?.uid;
  const ARCHETYPES = ['High-Functioning Exhausted', 'Over-Giver', 'Silent Resenter', 'Founder on Fire', 'Manager in the Middle'];

  const fetchResult = async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'recovery', 'fingerprint'));
      if (snap.exists()) setResult(snap.data());
      else setResult(null);
    } catch(e) { setError('You do not have permission to access this record.'); }
  };
  useEffect(() => { fetchResult(); }, [uid]);

  const handleSubmit = async () => {
    if (!uid) return;
    setLoading(true); setError('');
    try {
      await setDoc(doc(db, 'users', uid, 'recovery', 'fingerprint'), {
        archetype: selectedArchetype,
        identifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0',
        source: 'user_assessment'
      });
      setTakingTest(false);
      fetchResult();
    } catch(e) { setError('This entry could not be saved.'); }
    setLoading(false);
  };
  
  const handleDelete = async () => {
    if(!uid) return;
    try { await deleteDoc(doc(db, 'users', uid, 'recovery', 'fingerprint')); fetchResult(); }
    catch(e) { setError('This entry could not be saved.'); }
  };

  return (
    <div className="space-y-6">
      <SecureVaultNotice />
      <ErrorMessage msg={error} />
      
      {!result && !takingTest && (
         <div className="text-center py-8">
           <p className="text-sm text-text-muted mb-4">No secure Fingerprint saved yet.</p>
           <button onClick={() => setTakingTest(true)} className="btn-primary py-2 px-6 text-sm rounded-xl">Take Deterministic Assessment</button>
         </div>
      )}
      
      {takingTest && (
         <div className="bg-surface p-4 rounded-xl border border-border space-y-4">
           <h4 className="font-bold text-sm">Deterministic Assessment</h4>
           <p className="text-xs text-text-muted">This is a coaching reflection tool, not a clinical diagnosis.</p>
           <h5 className="text-xs font-bold mt-2">Select your closest match to save to vault:</h5>
           <div className="flex flex-col gap-2">
             {ARCHETYPES.map(a => (
               <button key={a} onClick={() => setSelectedArchetype(a)} className={cn("p-3 text-left text-xs rounded-lg border", selectedArchetype === a ? "bg-primary/20 border-primary text-primary" : "border-border hover:bg-card")} >
                 {a}
               </button>
             ))}
           </div>
           
           <div className="flex gap-2">
             <button onClick={() => setTakingTest(false)} className="flex-1 py-2 text-xs font-bold text-text-muted">Cancel</button>
             <button onClick={handleSubmit} disabled={loading} className="flex-1 btn-primary py-2 text-xs">Save Result</button>
           </div>
         </div>
      )}
      
      {result && !takingTest && (
        <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl relative">
          <button onClick={handleDelete} className="absolute top-4 right-4 text-text-muted hover:text-destructive text-xs flex gap-1 items-center"><Trash2 className="w-3 h-3"/> Reset</button>
          <div className="text-xs uppercase tracking-widest font-black text-primary mb-2">Active Archetype</div>
          <h3 className="text-2xl font-bold text-text-main">{result.archetype}</h3>
          
          <div className="text-xs text-text-muted mt-4 p-3 bg-surface rounded-xl border border-border">
            Based on your answers, this pattern may describe how burnout is currently showing up for you. This is a coaching reflection tool, not a clinical diagnosis.
          </div>
          
          <div className="text-[10px] text-text-muted mt-4">Identified: {new Date(result.identifiedAt).toLocaleDateString()}</div>
          <div className="mt-4"><button onClick={() => setTakingTest(true)} className="text-primary text-xs hover:underline font-bold">Retake Assessment</button></div>
        </div>
      )}
    </div>
  );
};
`
fs.appendFileSync('src/components/ConnectedRecoveryModules.tsx', content);
