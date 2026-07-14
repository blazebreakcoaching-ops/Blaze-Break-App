import fs from 'fs';
import path from 'path';

function replaceIndigo(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceIndigo(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let newContent = content
        .replace(/bg-indigo-600/g, 'bg-primary')
        .replace(/bg-indigo-500/g, 'bg-primary')
        .replace(/text-indigo-600/g, 'text-primary')
        .replace(/text-indigo-500/g, 'text-primary')
        .replace(/text-indigo-400/g, 'text-primary')
        .replace(/bg-indigo-400\/10/g, 'bg-primary/10')
        .replace(/bg-indigo-500\/10/g, 'bg-primary/10')
        .replace(/bg-indigo-500\/20/g, 'bg-primary/20')
        .replace(/border-indigo-500\/20/g, 'border-primary/20')
        .replace(/border-indigo-500\/30/g, 'border-primary/30')
        .replace(/decoration-indigo-500\/30/g, 'decoration-primary/30')
        .replace(/text-indigo-300/g, 'text-primary')
        .replace(/bg-indigo-50/g, 'bg-primary-light')
        .replace(/ring-indigo-500/g, 'ring-primary')
        .replace(/border-indigo-500/g, 'border-primary')
        .replace(/from-indigo-500/g, 'from-primary')
        .replace(/to-indigo-500/g, 'to-primary')
        .replace(/from-indigo-900\/20/g, 'from-primary/20')
        .replace(/from-indigo-500\/10/g, 'from-primary/10')
        .replace(/from-indigo-500\/5/g, 'from-primary/5')
        .replace(/shadow-indigo-500\/20/g, 'shadow-primary/20')
        .replace(/shadow-indigo-500\/30/g, 'shadow-primary/30')
        .replace(/focus:border-indigo-500/g, 'focus:border-primary')
        .replace(/focus:ring-indigo-500/g, 'focus:ring-primary')
        .replace(/hover:text-indigo-400/g, 'hover:text-primary')
        .replace(/hover:text-indigo-500/g, 'hover:text-primary')
        .replace(/hover:bg-indigo-500\/10/g, 'hover:bg-primary/10')
        .replace(/hover:border-indigo-500\/30/g, 'hover:border-primary/30');

      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`Updated indigo to primary in ${fullPath}`);
      }
    }
  }
}

replaceIndigo('src');
