import fs from 'fs';
let txt = fs.readFileSync('src/App.tsx', 'utf8');

txt = txt.replace(
  'font-serif font-bold text-lg tracking-tight',
  'font-display font-black text-xl tracking-tighter'
);
txt = txt.replace(
  'text-[11px] font-bold uppercase tracking-[0.2em] text-text-muted mt-1.5',
  'text-[10px] font-bold uppercase tracking-[0.2em] text-primary mt-1'
);

fs.writeFileSync('src/App.tsx', txt);
