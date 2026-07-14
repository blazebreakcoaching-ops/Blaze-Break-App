import fs from 'fs';

let content = fs.readFileSync('src/components/PrivacyVault.tsx', 'utf8');

// prepend import
content = content.replace(
  /export const PrivacyVault =/,
  `import { ConnectedNovaPermissions } from './ConnectedRecoveryModules.tsx';\nimport { auth } from '../lib/firebase';\n\nexport const PrivacyVault =`
);

content = content.replace(
  /<h3 className="font-bold text-text-main text-lg">Nova Memory Centre<\/h3>[\s\S]*?<div className="space-y-8 pl-4 border-l border-white\/\[0\.05\] max-w-3xl">/,
  `<h3 className="font-bold text-text-main text-lg">Nova Memory Centre</h3>
                  <p className="text-xs text-text-muted mt-1">Control exactly what the AI knows about you.</p>
                </div>
              </div>

              {auth.currentUser ? <ConnectedNovaPermissions /> : (
                 <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
              )}

              <div className="space-y-8 pl-4 border-l border-white/[0.05] max-w-3xl">`
);

fs.writeFileSync('src/components/PrivacyVault.tsx', content);
