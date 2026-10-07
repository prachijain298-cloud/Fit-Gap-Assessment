// Builds the single-file dashboard (Process-Fit-Assessment.html) from the app source and the presentation CSS.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(root, 'src/imports/Process-Fit-Assessment__1_.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/enterprise.css'), 'utf8');
writeFileSync(resolve(root, 'Process-Fit-Assessment.html'), app.replace('</head>', '<style>' + css + '</style></head>'));
console.log('Wrote Process-Fit-Assessment.html');
