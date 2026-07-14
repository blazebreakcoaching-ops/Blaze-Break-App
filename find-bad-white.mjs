import fs from 'fs';
import path from 'path';

function findBadWhite(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findBadWhite(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('text-white') && !line.includes('bg-primary') && !line.includes('bg-destructive') && !line.includes('dark:text-white')) {
          if (line.includes('bg-card') || line.includes('bg-surface') || line.includes('text-white/')) {
            console.log(`${fullPath}:${i+1}: ${line.trim()}`);
          }
        }
      });
    }
  }
}

findBadWhite('src');
