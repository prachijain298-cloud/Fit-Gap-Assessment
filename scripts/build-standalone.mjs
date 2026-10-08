// Builds the single-file dashboard (Process-Fit-Assessment.html) from the app source and the presentation CSS.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(root, 'src/imports/Process-Fit-Assessment__1_.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/enterprise.css'), 'utf8');

// The real end of <head> is the one directly followed by <body> (the app bundle also contains "</head>" inside strings).
const marker = /<\/head>(\s*<body)/;
if (!marker.test(app)) throw new Error('Could not find </head> followed by <body> in the app source');
const out = app.replace(marker, (_match, body) => '<style>' + css + '</style></head>' + body);
writeFileSync(resolve(root, 'Process-Fit-Assessment.html'), out);
console.log('Wrote Process-Fit-Assessment.html');
