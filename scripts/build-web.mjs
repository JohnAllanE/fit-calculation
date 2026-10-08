// Bundle the browser app (src/ + data/ JSON inlined) into public/ for static hosting (Vercel).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('public', { recursive: true, force: true });
mkdirSync('public', { recursive: true });
await build({
  entryPoints: ['web/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2022'],
  outfile: 'public/app.js', loader: { '.json': 'json' }, logLevel: 'info',
});
cpSync('web/index.html', 'public/index.html');
cpSync('web/style.css', 'public/style.css');
