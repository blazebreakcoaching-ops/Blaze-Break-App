import fs from 'fs';
import path from 'path';

let count = 0;
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath);
    else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        const content = fs.readFileSync(dirPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('text-white')) {
            console.log(`${dirPath}:${i+1}: ${line.trim()}`);
            count++;
          }
        });
      }
    }
  });
}
walk('src/components');
walk('src/lib');
const content = fs.readFileSync('src/App.tsx', 'utf8');
content.split('\n').forEach((line, i) => {
  if (line.includes('text-white')) {
      console.log(`src/App.tsx:${i+1}: ${line.trim()}`);
      count++;
  }
});
console.log(`Total: ${count}`);
