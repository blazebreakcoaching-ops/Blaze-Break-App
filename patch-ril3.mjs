import fs from 'fs';

let content = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');

if (!content.includes('ConnectedMoodPulse')) {
  // Prepend import
  content = content.replace(
    /export const RecoveryIntelligenceLayer = \(\{ user,/g,
    `import { ConnectedMoodPulse, ConnectedBodyCheckIn, ConnectedWinsLog } from './ConnectedRecoveryModules.tsx';\n\nexport const RecoveryIntelligenceLayer = ({ user,`
  );

  const moodIndex = content.indexOf("{activeRoom === 'mood' && (");
  const nextRoom = content.indexOf("{activeRoom === 'trigger' && (", moodIndex);
  let oldMoodBlock = content.substring(moodIndex, nextRoom);
  
  content = content.replace(oldMoodBlock, `{activeRoom === 'mood' && (
                <motion.div
                  key="mood"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center shrink-0">
                      <HeartPulse className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-black text-text-main mt-1">Mood Pulse Room</h3>
                      <p className="text-xs text-text-muted mt-1">Deploy a fast biometric mood indicator to detect fatigue.</p>
                    </div>
                  </div>
                  {user ? <ConnectedMoodPulse /> : (
                    <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
                  )}
                </motion.div>
              )}\n\n              `);


  const bodyIndex = content.indexOf("{activeRoom === 'body' && (");
  const nextBodyRoom = content.indexOf("{activeRoom === 'weekly' && (", bodyIndex);
  let oldBodyBlock = content.substring(bodyIndex, nextBodyRoom);

  content = content.replace(oldBodyBlock, `{activeRoom === 'body' && (
                <motion.div
                  key="body"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center shrink-0">
                      <Wind className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-black text-text-main mt-1">Somatic Symptom Check-In</h3>
                      <p className="text-xs text-text-muted mt-1">Check for physical tension indicators before logical admittance.</p>
                    </div>
                  </div>
                  {user ? <ConnectedBodyCheckIn /> : (
                    <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
                  )}
                </motion.div>
              )}\n\n              `);

  const winsIndex = content.indexOf("{activeRoom === 'wins' && (");
  const nextWinsRoom = content.indexOf("{activeRoom === 'body' && (", winsIndex);
  let oldWinsBlock = content.substring(winsIndex, nextWinsRoom);

  content = content.replace(oldWinsBlock, `{activeRoom === 'wins' && (
                <motion.div
                  key="wins"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                      <Star className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-black text-text-main mt-1">Triumphs & Wins</h3>
                      <p className="text-xs text-text-muted mt-1">Anchor neuroplasticity by logging successful stress boundaries.</p>
                    </div>
                  </div>
                  {user ? <ConnectedWinsLog /> : (
                    <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
                  )}
                </motion.div>
              )}\n\n              `);

  fs.writeFileSync('src/components/RecoveryIntelligenceLayer.tsx', content);
}
