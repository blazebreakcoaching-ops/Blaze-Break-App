import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/className="w-5 h-5 rounded bg-white\/10 flex items-center justify-center shrink-0 text-xs font-bold"/g, 'className="w-5 h-5 rounded bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-text-main"');
content = content.replace(/className="text-xs uppercase font-black tracking-widest opacity-80"/g, 'className="text-xs uppercase font-black tracking-widest text-text-muted"');

fs.writeFileSync('src/App.tsx', content, 'utf8');
