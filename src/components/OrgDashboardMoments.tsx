import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Heart, Award, Target, MessageSquare, ThumbsUp, AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

interface RecognitionItem {
  id: string;
  from: string;
  message: string;
  createdAt?: string;
}

interface WinItem {
  id: string;
  title: string;
  content: string;
  category: string;
}

export const OrgDashboardMoments = () => {
  const [activeTab, setActiveTab] = useState<'wall' | 'challenges' | 'personal'>('wall');

  const [orgId, setOrgId] = useState<string | null>(null);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);
  const [wallLoading, setWallLoading] = useState(true);
  const [wallError, setWallError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [posting, setPosting] = useState(false);

  const [wins, setWins] = useState<WinItem[]>([]);
  const [winsLoading, setWinsLoading] = useState(true);

  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [challenges, setChallenges] = useState<{ id: string; title: string; description: string; participantCount: number; participationRate: number; joined: boolean }[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(true);
  const [challengesError, setChallengesError] = useState('');
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeDesc, setNewChallengeDesc] = useState('');
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const fetchChallenges = async (currentOrgId: string) => {
    setChallengesLoading(true);
    setChallengesError('');
    try {
      const res = await secureApiFetch(`/api/org/${currentOrgId}/challenges`);
      const data = await res.json();
      if (!res.ok) {
        setChallengesError(data.error || 'Could not load challenges.');
      } else {
        setChallenges(data.challenges || []);
      }
    } catch (e) {
      setChallengesError('Could not load challenges.');
    }
    setChallengesLoading(false);
  };

  const fetchWall = async (currentOrgId: string) => {
    setWallLoading(true);
    setWallError('');
    try {
      const res = await secureApiFetch(`/api/org/${currentOrgId}/recognition`);
      const data = await res.json();
      if (!res.ok) {
        setWallError(data.error || 'Could not load the recognition wall.');
      } else {
        setRecognitions(data.items || []);
      }
    } catch (e) {
      setWallError('Could not load the recognition wall.');
    }
    setWallLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const meRes = await secureApiFetch('/api/org/me');
        const me = await meRes.json();
        if (me.organisationId) {
          setOrgId(me.organisationId);
          setIsOrgAdmin(!!me.isOrgAdmin);
          await fetchWall(me.organisationId);
          await fetchChallenges(me.organisationId);
        } else {
          setWallLoading(false);
          setChallengesLoading(false);
        }
      } catch (e) {
        setWallLoading(false);
        setChallengesLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadWins = async () => {
      if (!auth.currentUser) return;
      setWinsLoading(true);
      try {
        const q = query(collection(db, 'users', auth.currentUser.uid, 'wins'), orderBy('createdAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        setWins(snap.docs.map(d => ({ id: d.id, ...d.data() } as WinItem)));
      } catch (e) {
        // Leaves wins empty - honest empty state.
      }
      setWinsLoading(false);
    };
    loadWins();
  }, []);

  const handlePost = async () => {
    if (!newMessage.trim() || !orgId) return;
    setPosting(true);
    setWallError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgId}/recognition`, {
        method: 'POST',
        data: { message: newMessage.trim(), isAnonymous },
      });
      const data = await res.json();
      if (!res.ok) {
        setWallError(data.error || 'Could not post that.');
      } else {
        setNewMessage('');
        await fetchWall(orgId);
      }
    } catch (e) {
      setWallError('Could not post that.');
    }
    setPosting(false);
  };

  const handleCreateChallenge = async () => {
    if (!newChallengeTitle.trim() || !orgId) return;
    setCreatingChallenge(true);
    setChallengesError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgId}/challenges`, {
        method: 'POST',
        data: { title: newChallengeTitle.trim(), description: newChallengeDesc.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        setChallengesError(data.error || 'Could not create that challenge.');
      } else {
        setNewChallengeTitle('');
        setNewChallengeDesc('');
        await fetchChallenges(orgId);
      }
    } catch (e) {
      setChallengesError('Could not create that challenge.');
    }
    setCreatingChallenge(false);
  };

  const handleToggleChallenge = async (challengeId: string, currentlyJoined: boolean) => {
    if (!orgId) return;
    setJoiningId(challengeId);
    setChallengesError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgId}/challenges/${challengeId}/${currentlyJoined ? 'leave' : 'join'}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        setChallengesError(data.error || 'Could not update your participation.');
      } else {
        await fetchChallenges(orgId);
      }
    } catch (e) {
      setChallengesError('Could not update your participation.');
    }
    setJoiningId(null);
  };

  const formatWhen = (createdAt?: string) => {
    if (!createdAt) return '';
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-warning/10 border border-warning/20 p-8">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Sparkles className="w-48 h-48 text-warning" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="tag bg-white dark:bg-card border-border shadow-sm text-text-main flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-warning" /> Blaze Bright Moments
            </div>
          </div>
          <h3 className="text-3xl font-display font-bold text-text-main tracking-tight mb-4">
            Notice What Works.
          </h3>
          <p className="text-sm text-text-muted leading-relaxed max-w-2xl mb-8">
            A positive reinforcement system built around appreciation, belonging and healthy team behaviour.
            We do not reward perfect attendance or working late. We celebrate how people support a healthy team.
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'wall', label: 'Team Recognition Wall', icon: MessageSquare },
              { id: 'challenges', label: 'Community Challenges', icon: Target },
              { id: 'personal', label: 'My Wins & Proof', icon: Award }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                    activeTab === tab.id
                      ? "bg-warning text-warning-foreground shadow-md shadow-warning/20"
                      : "bg-white dark:bg-surface text-text-muted border border-border hover:border-warning/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'wall' && (
          <motion.div key="wall" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
            <div className="card bg-white dark:bg-card border-border space-y-4">
              <h4 className="text-sm font-bold text-text-main flex items-center gap-2"><Heart className="w-4 h-4 text-warning" /> Note Some Appreciation</h4>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Thank a teammate, or call out something great someone did this week..."
                maxLength={300}
                className="w-full h-20 bg-surface dark:bg-surface/50 border border-border rounded-xl p-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-warning resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                  <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="rounded border-border" />
                  Post anonymously
                </label>
                <button
                  onClick={handlePost}
                  disabled={posting || !newMessage.trim()}
                  className="px-4 py-2 bg-warning text-warning-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Post
                </button>
              </div>
            </div>

            {wallError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl">{wallError}</div>
            )}

            {wallLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-warning" />
              </div>
            ) : !orgId ? (
              <div className="py-12 text-center text-text-muted text-sm">Join an organisation from the Trust &amp; Privacy Centre to see and post recognitions.</div>
            ) : recognitions.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
                <p className="text-text-muted text-sm">Nothing posted yet. Be the first to recognize a teammate above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recognitions.map(item => (
                  <div key={item.id} className="card bg-white dark:bg-card border-border hover:border-warning/30 transition-colors group">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-warning/20 text-warning">
                        <ThumbsUp className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-text-main">{item.from}</p>
                        <p className="text-xs text-text-muted uppercase tracking-widest">{formatWhen(item.createdAt)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-text-main leading-relaxed italic">"{item.message}"</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'challenges' && (
          <motion.div key="challenges" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
            <div className="card border-dashed border-border bg-surface dark:bg-surface/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-xs font-bold text-text-main">No leaderboards. No humiliation.</span>
              </div>
              <p className="text-sm text-text-muted">
                Good team challenges are uplifting and collaborative. We avoid metrics that breed toxic "presenteeism" (like perfect attendance or fastest replies).
              </p>
            </div>

            {isOrgAdmin && (
              <div className="card space-y-4">
                <h4 className="font-bold text-text-main flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Start a Challenge</h4>
                {challengesError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl">{challengesError}</div>
                )}
                <input
                  type="text"
                  value={newChallengeTitle}
                  onChange={(e) => setNewChallengeTitle(e.target.value)}
                  placeholder="e.g. Protect the Break Week"
                  maxLength={100}
                  className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                />
                <textarea
                  value={newChallengeDesc}
                  onChange={(e) => setNewChallengeDesc(e.target.value)}
                  placeholder="What's the goal, and how does someone take part?"
                  maxLength={300}
                  className="w-full h-16 bg-surface border border-border rounded-xl p-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
                />
                <button
                  onClick={handleCreateChallenge}
                  disabled={creatingChallenge || !newChallengeTitle.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {creatingChallenge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Award className="w-3.5 h-3.5" />}
                  Create Challenge
                </button>
              </div>
            )}

            {!isOrgAdmin && challengesError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl">{challengesError}</div>
            )}

            {challengesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : challenges.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
                <p className="text-text-muted text-sm">
                  {isOrgAdmin ? 'No challenges yet — create one above to get your team started.' : 'No challenges running right now. Check back soon.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {challenges.map(challenge => (
                  <div key={challenge.id} className="card space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        <h4 className="font-bold text-text-main">{challenge.title}</h4>
                      </div>
                      <span className={cn(
                        "text-xs font-bold uppercase tracking-widest px-2 py-1 rounded",
                        challenge.joined ? "text-success bg-success/10" : "text-text-muted bg-surface"
                      )}>
                        {challenge.joined ? 'Joined' : 'Not Joined'}
                      </span>
                    </div>
                    {challenge.description && (
                      <p className="text-xs text-text-muted">{challenge.description}</p>
                    )}
                    <div className="w-full bg-surface dark:bg-surface rounded-full h-2">
                      <div className="bg-success h-2 rounded-full transition-all" style={{ width: `${challenge.participationRate}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-text-muted">{challenge.participationRate}% Participation ({challenge.participantCount})</p>
                      <button
                        onClick={() => handleToggleChallenge(challenge.id, challenge.joined)}
                        disabled={joiningId === challenge.id}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5",
                          challenge.joined
                            ? "border border-border text-text-muted hover:text-text-main"
                            : "bg-warning text-warning-foreground hover:opacity-90"
                        )}
                      >
                        {joiningId === challenge.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {challenge.joined ? 'Leave' : 'Join'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'personal' && (
          <motion.div key="personal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
             <div className="card">
               <h3 className="font-bold text-text-main mb-2 flex items-center gap-2"><Target className="w-5 h-5 text-primary" /> My Private Wins Log</h3>
               <p className="text-xs text-text-muted mb-6">
                 These are visible only to you. You can choose to share them to the wall or keep them private.
               </p>

               {winsLoading ? (
                 <div className="flex items-center justify-center py-10">
                   <Loader2 className="w-5 h-5 animate-spin text-primary" />
                 </div>
               ) : wins.length === 0 ? (
                 <div className="py-10 text-center border-2 border-dashed border-border rounded-xl">
                   <p className="text-text-muted text-sm">No wins logged yet — these come from the wins you track elsewhere in the app.</p>
                 </div>
               ) : (
                 <div className="space-y-3">
                   {wins.map(win => (
                     <div key={win.id} className="p-4 border border-border bg-surface rounded-xl flex items-center justify-between group">
                       <div className="flex items-center gap-3 min-w-0">
                         <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                         <span className="text-sm font-medium text-text-main truncate">{win.title || win.content}</span>
                       </div>
                       <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                         <button
                           onClick={async () => {
                             if (!orgId) return;
                             try {
                               await secureApiFetch(`/api/org/${orgId}/recognition`, {
                                 method: 'POST',
                                 data: { message: win.content || win.title, isAnonymous: false },
                               });
                               await fetchWall(orgId);
                               setActiveTab('wall');
                             } catch (e) {
                               // Non-critical - the win itself stays intact either way.
                             }
                           }}
                           disabled={!orgId}
                           className="text-xs text-warning bg-warning/10 dark:bg-warning/10 px-2 py-1 rounded border border-warning/30 dark:border-warning/20 font-bold hover:bg-warning/20 dark:hover:bg-warning/20 disabled:opacity-40"
                         >
                           Share to Wall
                         </button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
