import fs from 'fs';
import path from 'path';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Replaces where bg-white is used without a dark override, causing it to remain white in dark mode.
  // text-text-main automatically becomes light in dark mode, so white background + light text = whiteout.
  content = content.replace(/className=\"([^\"]*)bg-white([^\"]*)text-text-main([^\"]*)\"/g, (m, a, b, d) => {
    if (!m.includes('dark:bg-') && !m.includes('dark:text-')) {
      return `className="${a}bg-surface dark:bg-card${b}text-text-main${d}"`;
    } else if (m.includes('dark:bg-white') && !m.includes('dark:text-')) {
      return m.replace('text-text-main', 'text-text-main dark:text-slate-900');
    }
    return m;
  });

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
