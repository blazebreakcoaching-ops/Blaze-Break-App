import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath, callback);
    else callback(dirPath);
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Change bg-slate-[8/9/95]00 without `dark:` into `bg-slate-900 dark:bg-slate-800` to be safe? 
  // No, if it's meant to be a dark card in light mode, maybe `bg-slate-900` is fine, but it makes the theme INCONSISTENT.
  // User: "parts of the UI look polished at first glance but are inconsistent once switching between light and dark themes."
  // If we change it to `bg-card` it adapts correctly!
  
  // Wait, if I replace `bg-slate-900` with `bg-card dark:bg-slate-900`, then in light mode it's white.
  // Then the `text-white` inside it becomes INVISIBLE in light mode!
  // BUT the user states: "white text appears on white or very light backgrounds in light mode". 
  // This means the user ALREADY experiences this bug!! 
  // WHY? Because they used `glass` which sets `background: var(--card)`, and then IN THE SAME file they put `text-white`!
  // Yes! Let's find `glass` + `text-white` or `card` + `text-white` without explicit `bg-slate-[something]`.
  
  content = content.replace(/className=(["'])(.*?)\1/g, (match, quote, classNames) => {
    // If it has `text-white` but DOES NOT have a truly dark solid background class (like bg-primary, bg-slate-X, bg-black, bg-indigo-X, bg-red-X)
    if (classNames.includes('text-white') && 
       !classNames.match(/bg-(primary|slate|gray|zinc|neutral|black|indigo|blue|emerald|rose|red|amber|sky|accent)/)) {
       
       // AND we are NOT `text-white/5` (opacity)
       if (classNames.match(/\btext-white(\s|"|'|$)/)) {
          return match.replace(/\btext-white\b/g, 'text-text-main dark:text-white');
       }
    }
    return match;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Replaced floating text-white in ${filePath}`);
  }
}

walk('src/components', processFile);
walk('src/lib', processFile);
processFile('src/App.tsx');
