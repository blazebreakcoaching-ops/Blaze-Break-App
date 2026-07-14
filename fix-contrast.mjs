import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Replace text-white on bg-primary with text-primary-foreground
  content = content.replace(/bg-primary([^"']*?)text-white/g, 'bg-primary$1text-primary-foreground');
  content = content.replace(/text-white([^"']*?)bg-primary/g, 'text-primary-foreground$1bg-primary');
  
  // Replace text-white on bg-destructive with text-destructive-foreground
  content = content.replace(/bg-destructive([^"']*?)text-white/g, 'bg-destructive$1text-destructive-foreground');
  content = content.replace(/text-white([^"']*?)bg-destructive/g, 'text-destructive-foreground$1bg-destructive');

  // Replace bg-amber-500 text-white with text-amber-950 for contrast
  content = content.replace(/bg-amber-500([^"']*?)text-white/g, 'bg-amber-500$1text-amber-950');
  
  // Change bg-emerald-500 bounded buttons with white text to bg-emerald-600 for contrast
  content = content.replace(/bg-emerald-500([^"']*?)text-white/g, 'bg-emerald-600$1text-white');
  
  // Also any standalone text-white that should ideally be text-text-main or text-primary-foreground
  // This is tricky, let's fix known bad practices.
  // ReflectSection issues:
  content = content.replace(/selected\?\.id === c\.id \? "text-white" : "text-text-main/g, 'selected?.id === c.id ? "text-primary" : "text-text-main');

  // "text-white" on card or surface often fails in light mode. Let's look for text-white and text-slate-*
  content = content.replace(/text-slate-950/g, 'text-text-main');
  content = content.replace(/text-slate-350/g, 'text-text-muted');
  content = content.replace(/text-slate-805/g, 'text-text-main');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  }
}

function traverseDir(dir) {
  const elements = fs.readdirSync(dir);
  for (const el of elements) {
    const fullPath = path.join(dir, el);
    if (fs.statSync(fullPath).isDirectory()) {
      traverseDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

traverseDir('./src');
