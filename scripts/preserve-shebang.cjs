#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const entryPath = path.resolve(__dirname, '..', 'src', 'cli', 'index.ts');
const outputPath = path.resolve(__dirname, '..', 'dist', 'cli', 'index.js');
const shebang = '#!/usr/bin/env node';

if (!fs.existsSync(entryPath)) {
  process.exit(0);
}

const entryContents = fs.readFileSync(entryPath, 'utf8');
if (!entryContents.startsWith('#!')) {
  process.exit(0);
}

if (!fs.existsSync(path.dirname(outputPath))) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

const outputExists = fs.existsSync(outputPath);
const outputContents = outputExists ? fs.readFileSync(outputPath, 'utf8') : '';
if (outputContents.startsWith(shebang)) {
  process.exit(0);
}

const stripped = outputContents.replace(/^#!.*\n/, '');
fs.writeFileSync(outputPath, `${shebang}\n${stripped}`, 'utf8');
