// After `vite build`: write dist-artifact/ — the same app shaped for the Claude artifact host (page content only, no service worker).
// The on-device speech checker (asr/ and the .wasm runtime) is left out: the artifact viewer doesn't allow the microphone.
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist'), out = path.resolve('dist-artifact');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = [...head.matchAll(/<(title)>[\s\S]*?<\/title>|<meta name="(description|theme-color)"[^>]*>|<link rel="stylesheet"[^>]*>|<script type="module"[^>]*><\/script>|<link rel="modulepreload"[^>]*>/g)].map(m => m[0]);
const title = keep.find(k => k.startsWith('<title')); const rest = keep.filter(k => k !== title);
const page = [title, '<meta name="claude:viewport-fit-sides" content="cover">', ...rest, body.replace(/<script[^>]*registerSW[^>]*><\/script>/g, '').trim()].join('\n');
fs.writeFileSync(path.join(out, 'index.html'), page + '\n');
for (const dir of ['assets', 'data', 'audio'].filter(d => fs.existsSync(path.join(dist, d)))) fs.cpSync(path.join(dist, dir), path.join(out, dir), { recursive: true, filter: src => !src.endsWith('.wasm') });
const files = [];
(function walk(d, rel = '') { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? rel + '/' + f : f; if (fs.statSync(p).isDirectory()) walk(p, r); else if (r !== 'index.html') files.push(r); } })(out);
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(files, null, 0));
console.log(`artifact build: ${files.length} files in dist-artifact/`);
