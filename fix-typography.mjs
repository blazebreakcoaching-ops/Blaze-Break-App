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
        
        content = content.replace(/text-\[9px\]/g, 'text-[11px]');
        content = content.replace(/text-\[10px\]/g, 'text-xs');
        // Let's also do text-[11px] => text-sm ? Maybe just 11px is enough.
        
        if (content !== original) {
           fs.writeFileSync(dirPath, content, 'utf8');
           console.log(`Replaced tiny text in ${dirPath}`);
        }
      }
    }
  });
}
walk('src');
