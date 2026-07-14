import fs from 'fs';
import path from 'path';

function replaceSlate(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceSlate(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Slate background to surface/card/border
      content = content
        .replace(/bg-slate-950/g, 'bg-background') // although we don't have bg-background, we have bg-surface
        .replace(/bg-slate-900/g, 'bg-card')
        .replace(/bg-slate-800/g, 'bg-surface')
        .replace(/bg-slate-100/g, 'bg-surface')
        .replace(/bg-slate-50/g, 'bg-surface')
        .replace(/bg-slate-200/g, 'bg-border')
        .replace(/border-slate-800/g, 'border-border')
        .replace(/border-slate-700/g, 'border-border')
        .replace(/border-slate-200/g, 'border-border')
        .replace(/border-slate-100/g, 'border-border')
        .replace(/text-slate-900/g, 'text-text-main')
        .replace(/text-slate-800/g, 'text-text-main')
        .replace(/text-slate-700/g, 'text-text-muted')
        .replace(/text-slate-600/g, 'text-text-muted')
        .replace(/text-slate-500/g, 'text-text-muted')
        .replace(/text-slate-400/g, 'text-text-muted')
        .replace(/text-slate-300/g, 'text-text-muted')
        .replace(/text-slate-200/g, 'text-text-muted')
        .replace(/text-slate-100/g, 'text-text-main')
        // We will replace surface manually later
        .replace(/bg-background/g, 'bg-surface');
      
      if (content !== fs.readFileSync(fullPath, 'utf8')) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated slate to semantic in ${fullPath}`);
      }
    }
  }
}

replaceSlate('src');
