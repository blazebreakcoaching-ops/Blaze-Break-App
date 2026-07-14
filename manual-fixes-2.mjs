import fs from 'fs';
import path from 'path';

function fixFiles() {
  const fixes = [
    {
      file: 'src/components/RecoveryAlly.tsx',
      target: '"absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"',
      replacement: '"absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-surface dark:border-surface rounded-full"'
    },
    {
      file: 'src/components/NovaGuardianRelay.tsx',
      target: 'shadow-slate-900/10',
      replacement: 'shadow-black/10'
    },
    {
      file: 'src/components/OrgDashboard.tsx',
      target: 'bg-card border-slate-900 dark:bg-white dark:border-white',
      replacement: 'bg-primary border-primary text-primary-foreground shadow-md'
    }
  ];

  fixes.forEach(fix => {
    let content = fs.readFileSync(fix.file, 'utf8');
    if (content.includes(fix.target)) {
      content = content.replace(fix.target, fix.replacement);
      fs.writeFileSync(fix.file, content, 'utf8');
      console.log(`Applied fix in ${fix.file}`);
    }
  });
}

fixFiles();
