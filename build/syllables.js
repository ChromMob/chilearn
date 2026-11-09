// Map every pinyin syllable+tone to a common, single-reading character for TTS playback.
const fs = require('fs');
const { pinyin } = require('pinyin-pro');
const order = [];
const seen = new Set();
for (const l of ['1','2','3','4','5','6','adv']) {
  for (const line of fs.readFileSync(`inputs/hsk${l}_words.txt`,'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    for (const ch of line.split('\t')[0]) if (!seen.has(ch)) { seen.add(ch); order.push(ch); }
  }
}
for (const f of fs.readdirSync('node_modules/hanzi-writer-data')) {
  const ch = f.replace('.json',''); if ([...ch].length === 1 && !seen.has(ch)) { seen.add(ch); order.push(ch); }
}
const map = {};
for (const ch of order) {
  const all = pinyin(ch, { multiple: true, type: 'array', toneType: 'num' });
  if (all.length !== 1) continue;
  let s = all[0].replace('v', 'ü'); if (/0$/.test(s)) continue;
  if (!map[s]) map[s] = ch;
}
fs.writeFileSync(process.argv[2], JSON.stringify(map));
console.log(Object.keys(map).length, 'syllables', ['ma1','ma2','ma3','ma4','nü3','lüe4','zhi1','ri4','er2'].map(k=>k+map[k]).join(' '));
