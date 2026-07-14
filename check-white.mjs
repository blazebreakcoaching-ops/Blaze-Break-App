import fs from 'fs';
import path from 'path';

let count = 0;
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath);
    else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        let content = fs.readFileSync(dirPath, 'utf8');
        let original = content;
        
        // Let's replace `text-white` where it's explicitly tied to something that might not be dark, or where they failed to use `text-text-main`.
        // Better yet: we just ensure we only ever use text-white on PRIMARY, SUCCESS, ACCENT, DANGER buttons, OR `dark:text-white`.
        // Let's replace purely `text-white` with `text-text-main` where it occurs outside of buttons or obvious dark backgrounds.
        // Actually, many places use `<h2 className="... text-white">` instead of `text-text-main` where the background adapts.
        
        // Find lines with `text-white` but WITHOUT `bg-slate-9` or `bg-indigo-` or `bg-primary` etc.
        const lines = content.split('\n');
        const newLines = lines.map(line => {
          if (line.includes('text-white')) {
            if (!line.match(/bg-(slate|gray|neutral|zinc)-(900|950|800)/) && 
                !line.match(/bg-(indigo|blue|emerald|rose|red|amber|primary|accent|sky)-(500|600|700|800|900)/) &&
                !line.match(/bg-gradient/) &&
                !line.match(/bg-black/) &&
                !line.match(/text-white\/[0-9]+/) && // Exclude text-white/50
                !line.match(/dark:text-white/)) {
                
                // If it's something like `text-white` alone, maybe we replace it with `dark:text-white text-text-main`
                // But `text-text-main` already handles dark mode. So we can just replace `text-white` with `text-text-main dark:text-white` or just `text-text-main`.
                if(line.includes('text-white"')) {
                   // return line.replace('text-white"', 'text-text-main"');
                   console.log(`[WARN]: ${dirPath}: ${line.trim()}`);
                }
            }
          }
          return line;
        });
      }
    }
  });
}
walk('src/components');
walk('src/lib');
