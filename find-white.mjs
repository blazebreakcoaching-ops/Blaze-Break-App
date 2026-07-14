import fs from 'fs';
import path from 'path';

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath);
    else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        let content = fs.readFileSync(dirPath, 'utf8');
        let lines = content.split('\n');
        
        lines.forEach((line, i) => {
            if(line.includes('text-white') && !line.includes('dark:text-white') && !line.includes('bg-primary') && !line.includes('bg-accent') && !line.includes('bg-emerald') && !line.includes('bg-amber') && !line.includes('bg-rose') && !line.includes('bg-indigo') && !line.includes('bg-sky')) {
                // If it's something like \btext-white\b
                if (line.match(/\btext-white\b/)) {
                    console.log(`${dirPath}:${i+1}: ${line.trim()}`);
                }
            }
        });
      }
    }
  });
}
walk('src/components');
walk('src/App.tsx');
