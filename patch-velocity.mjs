import fs from 'fs';

let content = fs.readFileSync('src/components/RecoveryIntelligenceLayer.tsx', 'utf8');

const oldVelocity = content.substring(
  content.indexOf("{activeRoom === 'velocity' && ("),
  content.indexOf("{activeRoom === 'mood' && (")
);

const newVelocity = `{activeRoom === 'velocity' && (
              <motion.div
                key="velocity"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
              >
                 <h3 className="text-2xl font-display font-black text-text-main mt-1">Recovery Velocity</h3>
                 <div className="p-4 bg-surface text-sm text-text-muted rounded-xl mt-4 border border-border">
                   Recovery trends will become available once secure scoring logic is implemented.
                 </div>
              </motion.div>
            )}\n\n            `;

content = content.replace(oldVelocity, newVelocity);
fs.writeFileSync('src/components/RecoveryIntelligenceLayer.tsx', content);
