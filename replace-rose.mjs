import fs from 'fs';
import path from 'path';

function replaceRose(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceRose(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let newContent = content
        .replace(/bg-rose-500/g, 'bg-destructive')
        .replace(/bg-rose-600/g, 'bg-destructive')
        .replace(/text-rose-400/g, 'text-destructive')
        .replace(/text-rose-500/g, 'text-destructive')
        .replace(/border-rose-500/g, 'border-destructive')
        .replace(/border-rose-500\/30/g, 'border-destructive/30')
        .replace(/shadow-rose-900\/20/g, 'shadow-destructive/20')
        .replace(/bg-rose-500\/10/g, 'bg-destructive/10')
        .replace(/bg-rose-500\/5/g, 'bg-destructive/5')
        .replace(/from-rose-500\/5/g, 'from-destructive/5')
        .replace(/from-rose-500\/10/g, 'from-destructive/10')
        .replace(/text-red-500/g, 'text-destructive')
        .replace(/bg-red-500/g, 'bg-destructive')
        .replace(/bg-red-500\/10/g, 'bg-destructive/10')
        .replace(/hover:bg-red-600/g, 'hover:bg-destructive-foreground hover:bg-opacity-90'); // rough fix

      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`Updated rose/red to destructive in ${fullPath}`);
      }
    }
  }
}

replaceRose('src');
