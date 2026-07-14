import fs from 'fs';
import path from 'path';

function fixFiles() {
  const fixes = [
    {
      file: 'src/components/BoundaryRehearsal.tsx',
      target: '"bg-surface text-white shadow-md border border-border"',
      replacement: '"bg-primary text-primary-foreground shadow-md border border-primary"'
    },
    {
      file: 'src/components/DailyCheckIn.tsx',
      target: '"bg-card text-white border-slate-900 shadow-lg"',
      replacement: '"bg-primary text-primary-foreground border-primary shadow-lg"' 
    },
    {
      file: 'src/components/EnergyBudget.tsx',
      target: '"bg-surface text-white dark:bg-border dark:text-text-main"',
      replacement: '"bg-primary text-primary-foreground dark:bg-border dark:text-text-main"'
    },
    {
      file: 'src/components/FutureSelfSimulator.tsx',
      target: 'isActive ? "text-white/80" : "text-text-muted"',
      replacement: 'isActive ? "text-primary-foreground/80" : "text-text-muted"'
    },
    {
      file: 'src/components/MovementSnacks.tsx',
      target: 'isSelected ? "bg-white/20 text-white" : "bg-surface dark:bg-surface text-text-muted"',
      replacement: 'isSelected ? "bg-primary text-primary-foreground" : "bg-surface dark:bg-surface text-text-muted"'
    },
    {
      file: 'src/components/NegotiatorTool.tsx',
      target: 'request.type === t ? "bg-card text-white border-slate-900 shadow-lg" : "bg-white text-text-muted border-border hover:border-slate-300"',
      replacement: 'request.type === t ? "bg-primary text-primary-foreground border-primary shadow-lg" : "bg-card text-text-muted border-border hover:border-primary"'
    },
    {
      file: 'src/components/NegotiatorTool.tsx',
      target: 'request.reason === r ? "bg-card text-white border-slate-900 shadow-lg" : "bg-white text-text-muted border-border hover:border-slate-300"',
      replacement: 'request.reason === r ? "bg-primary text-primary-foreground border-primary shadow-lg" : "bg-card text-text-muted border-border hover:border-primary"'
    },
    {
      file: 'src/components/NovaChat.tsx',
      target: '"px-8 py-4 bg-card text-white dark:bg-white dark:text-text-main rounded-full font-bold shadow-xl hover:scale-105 active:scale-95 transition-all relative z-10 flex items-center gap-2"',
      replacement: '"px-8 py-4 bg-primary text-primary-foreground rounded-full font-bold shadow-xl hover:scale-105 active:scale-95 transition-all relative z-10 flex items-center gap-2"'
    },
    {
      file: 'src/components/NovaChat.tsx',
      target: 'role === \'user\'\n                                  ? "bg-card dark:bg-surface text-white"',
      replacement: 'role === \'user\'\n                                  ? "bg-primary text-primary-foreground"'
    },
    {
      file: 'src/components/NovaGuardianRelay.tsx',
      target: 'contact.role.includes(\'guardian\') ? "bg-surface text-white hover:bg-surface" : "bg-surface dark:bg-surface text-text-main"',
      replacement: 'contact.role.includes(\'guardian\') ? "bg-primary text-primary-foreground hover:bg-primary-dark" : "bg-surface text-text-main"'
    },
    {
      file: 'src/components/OmniBrainMap.tsx',
      target: 'bg-surface/60 text-white',
      replacement: 'bg-surface/60 text-text-main'
    },
    {
      file: 'src/components/OmniBrainMap.tsx',
      target: '"w-full py-2 px-3 rounded-xl border border-white/10 bg-surface text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"',
      replacement: '"w-full py-2 px-3 rounded-xl border border-border bg-surface text-text-main text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"'
    },
    {
      file: 'src/components/RecoveryFuelEngine.tsx',
      target: '? "bg-card text-white dark:bg-white dark:text-slate-950 border-slate-900"',
      replacement: '? "bg-primary text-primary-foreground border-primary"'
    },
    {
      file: 'src/components/TacticalOverride.tsx',
      target: 'className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-center p-6 text-white"',
      replacement: 'className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-center p-6 text-text-main"'
    },
    {
      file: 'src/components/TacticalOverride.tsx',
      target: 'breathPhase.includes(\'hold\') ? \'text-white/50\' : \'text-white\'',
      replacement: 'breathPhase.includes(\'hold\') ? \'text-text-muted/50\' : \'text-text-main\''
    }
  ];

  fixes.forEach(fix => {
    let content = fs.readFileSync(fix.file, 'utf8');
    // Global replacement for basic strings, or just replace
    if (content.includes(fix.target)) {
      content = content.replace(new RegExp(fix.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.replacement);
      fs.writeFileSync(fix.file, content, 'utf8');
      console.log(`Applied fix in ${fix.file}`);
    } else {
      console.log(`Target not found in ${fix.file}: ${fix.target}`);
    }
  });
}

fixFiles();
