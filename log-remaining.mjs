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
            let match = line.match(/(?<!dark:)(?:text|bg|border)-slate-\d00/g);
            if(match) {
                match.forEach(m => {
                    if(m.startsWith('text-')) {
                        console.log(`${dirPath}:${i+1}: ${line.trim()}`);
                    }
                });
            }
        });
      }
    }
  });
}
walk('src/components');
walk('src/lib');
walk('src/App.tsx');
