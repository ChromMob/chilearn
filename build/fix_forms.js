// Re-pick the most common reading for multi-form entries using pinyin-pro, rewrite vocab files.
const fs = require('fs');
const { pinyin } = require('pinyin-pro');
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const byZh = new Map();
for (const e of src) { if (!byZh.has(e.s)) byZh.set(e.s, []); byZh.get(e.s).push(e); }
const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
let changed = 0;
for (const file of fs.readdirSync('vocab').filter(f => f.startsWith('vocab_'))) {
  const words = JSON.parse(fs.readFileSync('vocab/' + file, 'utf8'));
  for (const w of words) {
    const entries = byZh.get(w.zh) || [];
    const forms = entries.flatMap(e => e.f);
    if (forms.length < 2) continue;
    const want = norm(pinyin(w.zh, { toneType: 'num', type: 'array' }).map(x => x.replace(/0$/, '5')).join(' '));
    const hit = forms.find(f => norm(f.i.n) === want);
    if (hit && norm(hit.i.n) !== norm(w.num)) {
      w.py = hit.i.y; w.num = hit.i.n;
      w.en = hit.m.filter(m => !/^(variant of|old variant|surname )/.test(m)).slice(0, 3).join('; ') || hit.m.slice(0,3).join('; ');
      w.cl = hit.c || [];
      changed++;
    }
  }
  fs.writeFileSync('vocab/' + file, JSON.stringify(words, null, 0).replace(/},{/g, '},\n{'));
}
console.log('changed', changed);
