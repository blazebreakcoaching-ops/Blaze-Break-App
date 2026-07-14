import fs from 'fs';

let content = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');

content = content.replace(
  /export const RecoveryIntelligenceLayer = \(\{ user,/g,
  `import { ConnectedMoodPulse, ConnectedBodyCheckIn, ConnectedWinsLog } from './ConnectedRecoveryModules.tsx';\n\nexport const RecoveryIntelligenceLayer = ({ user,`
);

// Mood room
content = content.replace(
  /\{activeRoom === 'mood' && \([\s\S]*?<h3 className="text-2xl font-display font-black text-text-main mt-1">Mood Pulse Room<\/h3>[\s\S]*?<\/motion\.div>\n              \)\}/,
  `{activeRoom === 'mood' && (
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
              )}`
);

fs.writeFileSync('src/components/RecoveryIntelligenceLayer.tsx', content);
