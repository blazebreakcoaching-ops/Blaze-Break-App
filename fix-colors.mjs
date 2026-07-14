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

  // Replace hardcoded "text-slate-[789]00" -> "text-text-main" (only if not preceded by `dark:`)
  // Oh wait, `dark:text-slate-...` is fine.
  
  // Safe general replacements:
  
  // High contrast / main text (replaces black, slate-900, slate-800, etc)
  // We should NOT replace inside Template Strings that are logic, but most are in className.
  
  const replacements = [
    // text-white where it's on a typically light background unless it has a dark bg. 
    // It's safer to use text-text-main unless we KNOW it's a primary button or dark badge.
    
    // Instead of blind regex, let's look at specific text patterns that fail.
    // "dark grey text appears on black or very dark backgrounds in dark mode"
    // E.g. text-slate-800, text-slate-700, text-slate-900 without dark:
    { regex: /(?<!dark:)text-slate-(800|900)\b/g, replace: 'text-text-main' },
    { regex: /(?<!dark:)text-gray-(800|900)\b/g, replace: 'text-text-main' },
    
    // Grey text that fails in dark mode
    { regex: /(?<!dark:)text-slate-(600|700)\b/g, replace: 'text-text-muted' },
    { regex: /(?<!dark:)text-gray-(600|700)\b/g, replace: 'text-text-muted' },
    
    // Faint texts that don't transition
    { regex: /(?<!dark:)text-slate-(400|500)\b/g, replace: 'text-text-muted' },
    { regex: /(?<!dark:)text-gray-(400|500)\b/g, replace: 'text-text-muted' },
    { regex: /(?<!dark:)text-slate-300\b/g, replace: 'text-text-muted' },
    
    // Backgrounds that don't transition well (unless intended to be solid colors always)
    // Actually, "white text appears on white" -> maybe they have text-white without bg-something.
    // If we see `text-white` inside `card` or `glass` it usually assumes a dark theme. 
    // We should be careful about replacing `text-white` because it might be on `bg-primary` (which is dark) or `bg-indigo-500`.
    // Let's replace `text-white` with `text-text-main` ONLY if it's not preceded by a recognizable dark background class in the same string? Too complex for regex.
  ];

  replacements.forEach(({regex, replace}) => {
    content = content.replace(regex, replace);
  });

  // Handle text-white that are just floating (not in a colored bg)
  // A heuristic: if 'text-white' is in className but no 'bg-' exists (except bg-transparent or bg-white/X). But wait, what if the parent has the bg?
  // Let's just fix the dark text first.

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
};

walk('src/components', fixFile);
walk('src/lib', fixFile);
fixFile('src/App.tsx');
