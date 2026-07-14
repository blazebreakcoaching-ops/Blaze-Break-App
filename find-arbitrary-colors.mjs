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
let found = false;

files.forEach(f => {
    let txt = fs.readFileSync(f, 'utf8');
    const matches = txt.match(/bg-\[[^\]]+\]/g);
    if (matches) {
        console.log(f, matches);
        found = true;
    }
});

if (!found) console.log("No custom bg classes found!");
