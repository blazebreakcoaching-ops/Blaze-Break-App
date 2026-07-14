import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const fixFile = (filePath) => {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Many elements have `bg-slate-900 text-white` meant to be a card. 
  // We change them to `bg-card text-text-main` so they match the theme properly in both modes!
  content = content.replace(/\bbg-slate-900\b/g, 'bg-card text-text-main');
  content = content.replace(/\bbg-slate-800\b/g, 'bg-card');
  content = content.replace(/\bbg-slate-950\b/g, 'bg-card');
  content = content.replace(/\bbg-black\/20\b/g, 'bg-black/5 dark:bg-black/20');
  
  // Oh wait, `bg-slate-900` on a button? `w-full bg-slate-900 text-white` -> we should use `bg-primary text-white` maybe.
  // Actually, replacing `bg-slate-900` with `bg-primary text-primary-content` could be better if we defined `primary-content`.
  
  // Wait! Let's check text-white. If we changed `bg-slate-900` to `bg-card`, then `text-white` becomes invisible in light mode!
  // So we MUST also replace `text-white` with `text-text-main` where it's near `bg-card` or in general unless inside a primary button component.
  
  // Let's replace standalone `text-white` where it's causing issues.
  // But wait, the user says "white text appears on white or very light backgrounds in light mode". 
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    // console.log(`Updated ${filePath}`);
  }
};

// Instead of blind replacements, let's use the CLI standard tool to lint and check.
