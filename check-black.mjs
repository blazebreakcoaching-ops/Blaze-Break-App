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
        
        const replaceRules = [
           { from: /\btext-black\b/g, to: 'text-text-main dark:text-black' },
           // Oh wait, if it explicitly had `text-black`, maybe we should just replace with `text-text-main`?
           // What if it is `text-text-muted` using opacity?
        ];
        
        content = content.replace(/\btext-black\b/g, 'text-text-main');
        
        if (content !== original) {
           fs.writeFileSync(dirPath, content, 'utf8');
           console.log(`Replaced text-black in ${dirPath}`);
        }
      }
    }
  });
}
walk('src/components');
walk('src/lib');
