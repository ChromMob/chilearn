// Produce a standalone deployable site in ../dist (full HTML document + PWA manifest + service worker).
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '../site'), DIST = path.join(__dirname, '../dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SITE, DIST, { recursive: true });
const page = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
const tail = `
<script>if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'index.html'), head + page + tail);
fs.writeFileSync(path.join(DIST, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#c0392b"/><text x="256" y="350" font-size="300" text-anchor="middle" fill="#fff" font-family="serif">路</text></svg>`);
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: 'Lùxiàn Mandarin', short_name: 'Lùxiàn', start_url: './', display: 'standalone', background_color: '#f2f4ef', theme_color: '#2747a8',
  icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 1));
const version = Date.now();
const shell = ['./', 'index.html', 'app.css', ...fs.readdirSync(path.join(SITE, 'js')).map(f => 'js/' + f), 'data/core.json', 'data/syllables.json', 'data/charpy.json'];
fs.writeFileSync(path.join(DIST, 'sw.js'), `// Offline support: cache the app shell up front, everything else (lesson data, stroke data, fonts, libraries) on first use.
const CACHE = 'luxian-${version}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isShell = sameOrigin && (url.pathname.endsWith('/') || /\\.(html|css|js)$/.test(url.pathname) || /core\\.json$/.test(url.pathname));
  if (isShell) {
    // network first for the shell so updates arrive, cache fallback offline
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
  } else if (sameOrigin || /fonts\\.(googleapis|gstatic)\\.com|cdn\\.jsdelivr\\.net/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })));
  }
});
`);
console.log('dist ready:', DIST);
