// Collect every string the app can speak, with the pinyin and voice to use, grouped into packs (one per unit + shared packs).
const fs = require('fs');
const path = require('path');
const { pinyin } = require('../node_modules/pinyin-pro');
const D = path.join(__dirname, '../../app/public/data');
const core = JSON.parse(fs.readFileSync(path.join(D, 'core.json'), 'utf8'));
const syl = JSON.parse(fs.readFileSync(path.join(D, 'syllables.json'), 'utf8'));
const PUNCT = /^[\p{P}\p{S}\s]+$/u;
const isHan = c => /\p{Script=Han}/u.test(c);
const hanCount = s => [...s].filter(isHan).length;
const jobs = new Map(); // key -> job
const owner = new Map(); // key -> pack
function add(key, job, pack) { if (!jobs.has(key)) { jobs.set(key, { key, ...job }); owner.set(key, pack); } }
const MARK = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
function toNum(sylPy) { // 'mǎ' -> {base:'ma', tone:3}
  let tone = 5, base = '';
  for (const ch of sylPy.normalize('NFC')) { const i = MARK.indexOf(ch); if (i >= 0) { tone = (i % 4) + 1; base += 'aeiouü'[Math.floor(i / 4)]; } else base += ch; }
  return { base: base.replace(/[^a-zü]/g, ''), tone };
}
function monoJob(text, py, pack) {
  // single syllable: synthesise via a single-reading character with the same pinyin, then impose the exact tone
  const { base, tone } = toNum(py || pinyin(text));
  const rep = tone >= 1 && tone <= 4 ? syl[base + tone] : null;
  add(text, { kind: 'syl', text, src: rep || text, base, tone, voice: 'f' }, pack);
}
function wordJob(text, py, pack) {
  const n = hanCount(text);
  if (!n) return;
  if (n === 1 && [...text].length === 1) return monoJob(text, py, pack);
  add(text, { kind: 'word', text, voice: 'f' }, pack);
}
function sentJob(text, pack, voice = 'f') {
  const t = text.trim(); if (!hanCount(t)) return;
  if (hanCount(t) <= 4 && !/[，。！？、]/.test(t.slice(0, -1))) return wordJob(t.replace(/[。！？!?]$/, ''), null, pack) || add(t, { kind: 'word', text: t, voice }, pack);
  const key = voice === 'f' ? t : `${t}|${voice}`;
  add(key, { kind: 'sent', text: t, voice }, pack);
}
const splitSentences = t => t.match(/[^。！？!?]+[。！？!?”」]*/g) || [t];

// shared: pinyin syllables (chart, pinyin stage, tone trainer) and fixed UI phrases
for (const [k, ch] of Object.entries(syl)) { const m = /^([a-zü]+)([1-4])$/.exec(k); if (m) add(ch, { kind: 'syl', text: ch, src: ch, base: m[1], tone: Number(m[2]), voice: 'f' }, 'shared'); }
for (const p of ['你好！很高兴认识你。', '你好！', '你好，很高兴认识你。', '我们一起学习中文吧。']) sentJob(p, 'shared');
for (const w of ['你好', '谢谢', '老师', '学生', '中国', '朋友', '喜欢', '明天', '今天', '昨天', '电脑', '飞机', '米饭', '水果', '医生', '商店', '电影', '再见', '名字', '妈妈', '爸爸', '北京', '汉语', '苹果', '天气', '睡觉', '工作', '学习', '可以', '我们', '什么', '现在', '上午', '下雨', '杯子', '衣服', '很好', '水果', '不是', '不去', '不好', '一个', '一起', '一天']) wordJob(w, null, 'shared');

for (const L of core.levels) {
  const data = JSON.parse(fs.readFileSync(path.join(D, `L${L.key}.json`), 'utf8'));
  for (const u of data.units) {
    const pack = u.id;
    for (const w of u.words) wordJob(w, data.words[w]?.[0], pack);
    const tokens = new Map();
    const take = s => s.t.forEach((t, i) => { if (!PUNCT.test(t) && hanCount(t) && !tokens.has(t)) tokens.set(t, s.p?.[i]); });
    u.sentences.forEach(s => { sentJob(s.t.join(''), pack); take(s); });
    u.grammar.forEach(g => g.examples.forEach(e => { sentJob(e.t.join(''), pack); take(e); }));
    if (u.dialogue) {
      const order = [];
      u.dialogue.lines.forEach(l => { if (!order.includes(l.who)) order.push(l.who); sentJob(l.t.join(''), pack, order.indexOf(l.who) % 2 ? 'm' : 'f'); take(l); });
    }
    if (u.reading) splitSentences(u.reading.zh).forEach(s => sentJob(s, pack));
    (u.chengyu || []).forEach(c => { wordJob(c.zh, c.py, pack); sentJob(c.example.zh, pack); });
    for (const [t, p] of tokens) wordJob(t, data.words[t]?.[0] || u.xpy?.[t] || p, pack);
  }
}
const out = [...jobs.values()].map(j => ({ ...j, pack: owner.get(j.key) }));
fs.writeFileSync(path.join(__dirname, 'jobs.json'), JSON.stringify(out));
const by = k => out.filter(j => j.kind === k).length;
console.log(`${out.length} clips: ${by('syl')} single syllables, ${by('word')} words, ${by('sent')} sentences; ${new Set(out.map(j => j.pack)).size} packs`);
