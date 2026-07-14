import fs from 'fs';
import path from 'path';

const map = {
  // Purples / Indigos / Blues -> Primary (Orange) or muted
  'purple-500/20': 'primary/20',
  'purple-500': 'primary',
  'purple-900': 'primary-dark',
  'indigo-500/10': 'primary/10',
  'indigo-500': 'primary',
  'indigo-700': 'primary-dark',
  'indigo-900': 'primary-dark',
  'indigo-950': 'primary-dark',
  'indigo-50': 'primary-light',
  'indigo-100': 'primary-light',
  'indigo-200': 'primary-light',
  'indigo-400': 'primary',
  'blue-500/20': 'primary/20',
  'blue-500': 'primary',
  'blue-400': 'primary',
  'blue-950': 'primary-dark',
  'sky-500/20': 'surface',
  'sky-500': 'text-main', // Was probably for 'Rest' or something
  'sky-400': 'text-main',
  'sky-600': 'text-main',
  
  // Greens -> Success
  'emerald-500/20': 'success/20',
  'emerald-500/10': 'success/10',
  'emerald-500/25': 'success/25',
  'emerald-50': 'success/10',
  'emerald-100': 'success/20',
  'emerald-400': 'success',
  'emerald-500': 'success',
  'emerald-600': 'success',
  'emerald-700': 'success-foreground',
  'emerald-800': 'success-foreground',
  'emerald-900': 'success-foreground',
  'emerald-950': 'success-foreground',
  
  // Ambers / Yellows -> Warning
  'amber-500/20': 'warning/20',
  'amber-500/10': 'warning/10',
  'amber-500/25': 'warning/25',
  'amber-50': 'warning/10',
  'amber-100': 'warning/20',
  'amber-400': 'warning',
  'amber-500': 'warning',
  'amber-600': 'warning',
  'amber-700': 'warning-foreground',
  'amber-800': 'warning-foreground',
  'amber-900': 'warning-foreground',
  'amber-950': 'warning-foreground',
  'orange-500/20': 'primary/20',
  'orange-500': 'primary',
  'orange-700': 'primary-dark',
  'orange-50': 'primary-light',
  'yellow-500': 'warning',

  // Reds -> Destructive
  'red-500/20': 'destructive/20',
  'red-500': 'destructive',
  'red-400': 'destructive',
  'red-600': 'destructive',
  'red-700': 'destructive-foreground',
  'red-800': 'destructive-foreground',
  'red-900': 'destructive-foreground',
  'red-950': 'destructive-foreground',
  'red-50': 'destructive/10',
  'red-100': 'destructive/20',
  'red-200': 'destructive/20',

  // Grays -> semantic surface / border / text
  'slate-900': 'foreground',
  'slate-500': 'muted-foreground',
  'slate-600': 'muted-foreground',
  'slate-300': 'border',
  'slate-100': 'surface',
  'slate-50': 'surface',
  'gray-500': 'muted-foreground',
  'gray-600': 'muted-foreground',
  'zinc-900': 'card',
  'zinc-400': 'muted-foreground',
  'zinc-500': 'muted-foreground',
  'zinc-600': 'muted-foreground'
};

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
        results.push(path.join(dir, file));
    });
    return results;
}

const files = walk('./src/components');
files.push('./src/App.tsx');
files.push('./src/types.ts');
files.push('./src/main.tsx');

let regexStr = '\\b(?:text|bg|border|ring|shadow)-(' + Object.keys(map).map(k => k.replace(/\\//g, '\\\\/')).join('|') + ')\\b';
const regex = new RegExp(regexStr, 'g');

files.forEach(f => {
    let txt = fs.readFileSync(f, 'utf8');
    let original = txt;
    
    // Prefix replacements
    ['text-', 'bg-', 'border-', 'ring-', 'fill-', 'stroke-', 'shadow-'].forEach(prefix => {
       Object.entries(map).forEach(([key, val]) => {
           // We only replace if it's the exact word
           const exact = new RegExp('\\b' + prefix + key.replace(/\\//g, '\\/') + '\\b', 'g');
           txt = txt.replace(exact, prefix + val);
       });
    });
    
    if (txt !== original) {
        fs.writeFileSync(f, txt);
        console.log('Updated', f);
    }
});
