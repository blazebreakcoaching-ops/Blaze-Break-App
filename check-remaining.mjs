import fs from 'fs';
import path from 'path';

let remaining = 0;
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath);
    else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        let content = fs.readFileSync(dirPath, 'utf8');
        
        let match = content.match(/(?<!dark:)(?:text|bg|border)-slate-\d00/g);
        if (match) {
            match.forEach(m => {
               // Only complaining about text and border
               if(m.startsWith('text-')) {
                   // console.log(`${dirPath}: ${m}`);
                   remaining++;
               }
            });
        }
      }
    }
  });
}
walk('src/components');
walk('src/lib');
console.log(`Remaining text-slate-X00 without dark: ${remaining}`);
