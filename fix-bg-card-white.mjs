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

        // Where text-white is used directly with bg-card, replace with text-text-main
        content = content.replace(/className=(["'])(.*?)\1/g, (match, quote, classes) => {
           if (classes.includes('bg-card') && classes.includes('text-white') && !classes.includes('dark:text-white')) {
               return match.replace(/\btext-white\b/g, 'text-text-main dark:text-white');
           }
           if (classes.includes('hover:bg-card') && classes.includes('hover:text-white') && !classes.includes('dark:hover:text-white')) {
               return match.replace(/\bhover:text-white\b/g, 'hover:text-text-main dark:hover:text-white');
           }
           return match;
        });
        
        if (content !== original) {
            fs.writeFileSync(dirPath, content, 'utf8');
            console.log(`Replaced bg-card text-white in ${dirPath}`);
        }
      }
    }
  });
}
walk('src/components');
walk('src/lib');
