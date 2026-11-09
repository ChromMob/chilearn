// Bundle hanzi-writer stroke data for course characters into per-level chunk files.
const fs = require('fs');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const levels = ['1','2','3','4','5','6','adv'];
const seen = new Set(); const index = {}; let total = 0;
for (const l of levels) {
  const lines = fs.readFileSync(`inputs/hsk${l}_words.txt`, 'utf8').split('\n').filter(x => x && !x.startsWith('#'));
  const chunk = {};
  for (const line of lines) for (const ch of line.split('\t')[0]) {
    if (seen.has(ch)) continue; seen.add(ch);
    const p = `node_modules/hanzi-writer-data/${ch}.json`;
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    // round coordinates already ints; drop radStrokes to save space
    chunk[ch] = { strokes: d.strokes, medians: d.medians };
    index[ch] = l;
  }
  const s = JSON.stringify(chunk); total += s.length;
  fs.writeFileSync(`${out}/strokes-${l}.json`, s);
  console.log(l, Object.keys(chunk).length, 'chars', (s.length/1024).toFixed(0)+'KB');
}
console.log('total', (total/1024/1024).toFixed(1)+'MB', Object.keys(index).length, 'chars');
