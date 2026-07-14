import fs from 'fs';

let content = fs.readFileSync('src/index.css', 'utf8');

const additions = `
    /* Semantic Status */
    --success: #15803d; /* Calm deep green */
    --success-foreground: #ffffff;
    --info: #0369a1; /* Calm deep blue, not SaaS purple */
    --info-foreground: #ffffff;
`;

const additionsDark = `
    /* Semantic Status */
    --success: #166534;
    --success-foreground: #ffffff;
    --info: #075985;
    --info-foreground: #ffffff;
`;

const themeAdditions = `
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
`;

if (!content.includes('--color-success')) {
  content = content.replace('--color-focus-ring: var(--focus-ring);', '--color-focus-ring: var(--focus-ring);\n  ' + themeAdditions);
  content = content.replace('--focus-ring: rgba(234, 88, 12, 0.4);', '--focus-ring: rgba(234, 88, 12, 0.4);\n  ' + additions);
  content = content.replace('--focus-ring: rgba(249, 115, 22, 0.5);', '--focus-ring: rgba(249, 115, 22, 0.5);\n  ' + additionsDark);
  fs.writeFileSync('src/index.css', content);
}
