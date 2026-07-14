import fs from 'fs';

let content = `
// 6. Connected Nova Permissions
export const ConnectedNovaPermissions = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [perms, setPerms] = useState({
    allowCheckins: false, allowEnergyBudgets: false, allowMoodPulses: false,
    allowBodyCheckins: false, allowWins: false, allowWeeklyReviews: false,
    allowBoundaryScripts: false, allowGoals: false
  });
  
  const db = getFirestore();
  const uid = auth.currentUser?.uid;

  const fetchPerms = async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'nova_permissions', 'current'));
      if (snap.exists()) setPerms(snap.data() as any);
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
      <div className="bg-primary/5 text-primary text-xs p-3 rounded-lg border border-primary/20 mb-4 font-bold flex gap-2">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>Nova personalisation is not active yet. These settings prepare future permissions only.</span>
      </div>
      <ErrorMessage msg={error} />
      
      <div className="bg-surface p-4 rounded-xl border border-border space-y-2">
        {Object.entries(perms).filter(([k]) => k !== 'updatedAt').map(([k, v]) => (
          <div key={k} className="flex justify-between items-center p-2 hover:bg-card rounded-lg transition-colors">
            <span className="text-sm font-bold capitalize">{k.replace('allow', '')}</span>
            <button onClick={() => toggle(k as any)} disabled={loading} className={cn("w-12 h-6 rounded-full transition-colors relative", v ? "bg-primary" : "bg-border")}>
              <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform", v ? "translate-x-6" : "")} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
`;

fs.appendFileSync('src/components/ConnectedRecoveryModules.tsx', content);
