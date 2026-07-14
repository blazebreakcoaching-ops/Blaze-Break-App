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
        
        content = content.replace(/\bplaceholder:text-(slate|gray|zinc)-(600|500|400|300)\b/g, 'placeholder:text-text-muted');
        
        if (content !== original) {
           fs.writeFileSync(dirPath, content, 'utf8');
           console.log(`Replaced placeholder in ${dirPath}`);
        }
      }
    }
  });
}
walk('src/components');
walk('src/lib');
