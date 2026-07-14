import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
        results.push(path.join(dir, file));
    });
    return results;
}

const files = walk('./src/components');
files.push('./src/App.tsx');

const map = {
    'bg-[#02040a]': 'bg-background',
    'bg-[#030712]': 'bg-background',
    'bg-[#0A0F1C]': 'bg-surface',
    'bg-[#0a0f1c]': 'bg-surface',
    'bg-[#080c14]': 'bg-surface',
    'bg-[#0B1120]': 'bg-surface',
    'bg-[#08140c]': 'bg-success/10',
    'bg-[#141414]': 'bg-surface-elevated',
    'bg-[#6366f1]': 'bg-primary',
    'bg-[#334155]': 'bg-muted-foreground'
};

files.forEach(f => {
    let txt = fs.readFileSync(f, 'utf8');
    let original = txt;
    
    Object.entries(map).forEach(([search, replace]) => {
        txt = txt.split(search).join(replace);
    });
    
    if (txt !== original) {
        fs.writeFileSync(f, txt);
        console.log('Updated hex colors in', f);
    }
});
