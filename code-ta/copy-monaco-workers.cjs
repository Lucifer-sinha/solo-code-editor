// This file ensures Monaco Editor worker files are copied to the public directory for Vite.
const fs = require('fs');
const path = require('path');

const workers = [
  { src: 'esm/vs/language/json/json.worker.js', dest: 'json.worker.js' },
  { src: 'esm/vs/language/css/css.worker.js', dest: 'css.worker.js' },
  { src: 'esm/vs/language/html/html.worker.js', dest: 'html.worker.js' },
  { src: 'esm/vs/language/typescript/ts.worker.js', dest: 'ts.worker.js' },
  { src: 'esm/vs/editor/editor.worker.js', dest: 'editor.worker.js' }
];

const monacoBase = path.join(__dirname, 'node_modules/monaco-editor');
const publicMonaco = path.join(__dirname, 'public/monaco');

if (!fs.existsSync(publicMonaco)) fs.mkdirSync(publicMonaco, { recursive: true });

for (const { src, dest } of workers) {
  fs.copyFileSync(
    path.join(monacoBase, src),
    path.join(publicMonaco, dest)
  );
  console.log(`Copied ${src} to public/monaco/${dest}`);
} 