// Compile content + vocab into site data files: core.json, L<level>.json, charpy.json.
const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');
const OUT = process.env.OUT || path.join(__dirname, '../app/public/data');
const LEVELS = ['1', '2', '3', '4', '5', '6', 'adv'];
const PUNCT = /^[\p{P}\p{S}\s]+$/u;
const isHan = c => /\p{Script=Han}/u.test(c);

const POS = {};
for (const f of fs.readdirSync(path.join(__dirname, 'vocab')).filter(f => f.startsWith('vocab_'))) for (const w of JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', f), 'utf8'))) if (!POS[w.zh]) POS[w.zh] = (w.pos || [])[0] || '';
function readWords(l) {
  return fs.readFileSync(path.join(__dirname, 'inputs', `hsk${l}_words.txt`), 'utf8').split('\n').filter(x => x && !x.startsWith('#')).map(x => { const [zh, py, g, en] = x.split('\t'); return { zh, py, g, en }; });
}
function cleanPy(py) { return py.toLowerCase().replace(/\s+/g, ' ').trim(); }
/** pinyin per token, using whole-sentence context */
function tokPinyin(tokens) {
  const text = tokens.join('');
  const all = pinyin(text, { type: 'all' });
  // all: array per char {origin, pinyin, isZh}
  const out = []; let k = 0;
  for (const t of tokens) {
    const n = [...t].length; const parts = [];
    for (let i = 0; i < n; i++, k++) { const a = all[k]; if (a && a.isZh) parts.push(a.pinyin); }
    out.push(PUNCT.test(t) ? '' : parts.join(' '));
  }
  return out;
}
function charPinyin(text) {
  const all = pinyin(text, { type: 'all' });
  return all.map(a => (a.isZh ? a.pinyin : ''));
}
const toks = s => s.trim().split(/\s+/).filter(Boolean);
function sent(s, unitWords) {
  const t = toks(s.zh);
  const o = { t, p: tokPinyin(t), en: s.en };
  if (s.alt && s.alt.length) o.alt = s.alt.map(toks);
  if (s.focus) { const i = t.indexOf(s.focus); if (i >= 0) o.f = i; }
  return o;
}
function questions(qs) { return (qs || []).map(q => ({ q: q.q, qEn: q.qEn, options: q.options, answer: q.answer })); }

const core = { version: Date.now(), levels: [], charLevel: {} };
const charpy = {};
const stats = [];
for (const l of LEVELS) for (const w of readWords(l)) for (const ch of w.zh) if (isHan(ch) && !core.charLevel[ch]) core.charLevel[ch] = l;
for (const l of LEVELS) {
  const f = path.join(__dirname, 'content', l === 'adv' ? 'adv.json' : `hsk${l}.json`);
  const rmStale = () => { try { fs.unlinkSync(path.join(OUT, `L${l}.json`)); } catch (e) {} };
  if (!fs.existsSync(f)) { console.log('skip level', l, '(no content yet)'); rmStale(); continue; }
  let C;
  try { C = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('skip level', l, 'invalid JSON:', e.message); continue; }
  try { require('child_process').execFileSync('node', [path.join(__dirname, 'validate.js'), f, '--quiet'], { stdio: 'pipe' }); }
  catch (e) { if (!process.env.ALLOW_PARTIAL) { console.log('skip level', l, '(content not complete/valid yet)'); rmStale(); continue; } }
  const vocab = new Map(readWords(l).map(w => [w.zh, w]));
  const words = {};
  const units = [];
  const meta = [];
  for (const u of C.units) {
    for (const w of u.words) {
      const v = vocab.get(w); if (!v) continue;
      const py = cleanPy((u.pinyin && u.pinyin[w]) || v.py);
      const g = (u.glosses && u.glosses[w]) || v.g;
      words[w] = [py, g, v.en.length > 160 ? v.en.slice(0, 157) + '…' : v.en, POS[w] || ''];
    }
    const U = {
      id: u.id, words: u.words.filter(w => vocab.has(w)),
      extra: u.extra || {},
      xpy: Object.fromEntries(Object.keys(u.extra || {}).map(t => [t, pinyin(t)])),
      grammar: (u.grammar || []).map(g => ({ title: g.title, pattern: g.pattern, explain: g.explain, examples: (g.examples || []).map(e => { const t = toks(e.zh); return { t, p: tokPinyin(t), en: e.en }; }) })),
      sentences: (u.sentences || []).map(s => sent(s)),
    };
    if (u.dialogue) U.dialogue = { title: u.dialogue.title, lines: u.dialogue.lines.map(x => { const t = toks(x.zh); return { who: x.who, t, p: tokPinyin(t), en: x.en }; }), questions: questions(u.dialogue.questions) };
    if (u.reading) { const zh = u.reading.zh.replace(/\s+/g, ''); U.reading = { title: u.reading.title, zh, py: charPinyin(zh), en: u.reading.en, questions: questions(u.reading.questions) }; }
    if (u.chengyu) U.chengyu = u.chengyu.map(c => ({ zh: c.zh, py: c.py || pinyin(c.zh), lit: c.lit, en: c.en, example: { zh: c.example.zh.replace(/\s+/g, ''), en: c.example.en } }));
    units.push(U);
    meta.push({ id: u.id, title: u.title, titleZh: u.titleZh, goal: u.goal, nw: U.words.length, g: U.grammar.length, s: U.sentences.length, d: U.dialogue ? 1 : 0, r: U.reading ? 1 : 0, c: (U.chengyu || []).length });
  }
  fs.writeFileSync(path.join(OUT, `L${l}.json`), JSON.stringify({ key: l, words, units }));
  core.levels.push({ key: l, units: meta });
  stats.push(`${l}: ${units.length} units, ${Object.keys(words).length} words, ${units.reduce((a, u) => a + u.sentences.length, 0)} sentences, ${(fs.statSync(path.join(OUT, `L${l}.json`)).size / 1024).toFixed(0)}KB`);
}
// char -> toneless readings (for lenient speech matching)
const hwd = path.join(__dirname, 'node_modules/hanzi-writer-data');
for (const fn of fs.readdirSync(hwd)) {
  const ch = fn.replace('.json', ''); if ([...ch].length !== 1 || !isHan(ch)) continue;
  const r = [...new Set(pinyin(ch, { multiple: true, type: 'array', toneType: 'num' }).map(x => x.replace('ü', 'v')))];
  if (r.length && r[0]) charpy[ch] = r.join(' ');
}
fs.writeFileSync(path.join(OUT, 'core.json'), JSON.stringify(core));
fs.writeFileSync(path.join(OUT, 'charpy.json'), JSON.stringify(charpy));
console.log(stats.join('\n'));
console.log('core.json', (fs.statSync(path.join(OUT, 'core.json')).size / 1024).toFixed(0) + 'KB', 'charpy', Object.keys(charpy).length);
