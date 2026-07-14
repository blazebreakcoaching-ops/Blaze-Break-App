import fs from 'fs';
import path from 'path';

function cleanup(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanup(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;

      content = content
        .replace(/bg-card dark:bg-card/g, 'bg-card')
        .replace(/text-text-main dark:text-white/g, 'text-text-main')
        .replace(/text-text-main dark:text-text-main/g, 'text-text-main')
        .replace(/text-text-muted dark:text-text-muted/g, 'text-text-muted')
        .replace(/text-white dark:text-text-main/g, 'text-text-main') // e.g., if it was slate-900 text-white dark:text-white => now card text-main
        .replace(/bg-background/g, 'bg-surface')
        .replace(/bg-slate-[0-9]+/g, 'bg-surface'); // Catch any stragglers if any exist somehow
      
      // Specifically fix "text-white" inside bg-card or bg-surface which will be invisible in light mode.
      // But only if it doesn't have dark:text-white or something.
      // Actually we can just find 'bg-card' and 'text-white' in the same className string but that's hard with regex. Let's do it simply by checking common patterns.
      
      content = content.replace(/text-white/g, (match) => {
          return match; // Too risky, buttons need text-white.
      });

      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Cleaned up classes in ${fullPath}`);
      }
    }
  }
}

cleanup('src');
