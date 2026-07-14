import fs from 'fs';
import path from 'path';

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath);
    else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        let content = fs.readFileSync(dirPath, 'utf8');
        let original = content;

        // Automatically fix `bg-slate-50` or `bg-slate-100` that don't have a dark class.
        // It's much safer to replace `bg-slate-50` and `bg-slate-100` with `bg-surface dark:bg-card` (or similar) or just append `dark:bg-slate-800`.
        
        // Let's just find them:
        content = content.replace(/className=(["'])(.*?)\1/g, (match, quote, classes) => {
           // if classes has bg-slate-50 or 100 but no dark:bg-
           if (classes.match(/\bbg-(slate|gray|zinc)-(50|100)\b/) && !classes.includes('dark:bg-')) {
               return match.replace(/\bbg-(slate|gray|zinc)-(50|100)\b/g, '$& dark:bg-card');
           }
           // if bg-slate-800 or 900 but no dark:
           if (classes.match(/\bbg-(slate|gray|zinc)-(800|900)\b/) && !classes.includes('dark:bg-')) {
               return match.replace(/\bbg-(slate|gray|zinc)-(800|900)\b/g, 'bg-card');
           }
           // border-slate-X but no dark:border
           if (classes.match(/\bborder-(slate|gray|zinc)-(200|300)\b/) && !classes.includes('dark:border-')) {
               return match.replace(/\bborder-(slate|gray|zinc)-(200|300)\b/g, 'border-border');
           }
           if (classes.match(/\bborder-(slate|gray|zinc)-(700|800|900)\b/) && !classes.includes('dark:border-')) {
               return match.replace(/\bborder-(slate|gray|zinc)-(700|800|900)\b/g, 'border-border');
           }
           return match;
        });
        
        if (content !== original) {
            fs.writeFileSync(dirPath, content, 'utf8');
            console.log(`Patched bgs/borders in ${dirPath}`);
        }
      }
    }
  });
}
walk('src/components');
walk('src/lib');
walk('src');
