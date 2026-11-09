#!/usr/bin/env node
// Validates a course content file. Usage: node validate.js content/hsk1.json [--quiet]
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const quiet = process.argv.includes('--quiet');
const C = JSON.parse(fs.readFileSync(file, 'utf8'));
const B = __dirname;
const LEVELS = ['1', '2', '3', '4', '5', '6', 'adv'];
const lvl = String(C.level);
if (!LEVELS.includes(lvl)) { console.error('level must be 1..6 or "adv"'); process.exit(1); }
const li = LEVELS.indexOf(lvl);
const readList = l => fs.readFileSync(path.join(B, 'inputs', `hsk${l}_words.txt`), 'utf8').split('\n').filter(x => x && !x.startsWith('#')).map(x => x.split('\t')[0]);
const lower = new Set(); LEVELS.slice(0, li).forEach(l => readList(l).forEach(w => lower.add(w)));
const levelWords = readList(lvl);
const levelSet = new Set(levelWords);
const allUpTo = new Set([...lower, ...levelWords]);
const PUNCT = new Set('，。！？、：；“”‘’（）《》…—,.!?:;"\'()·「」『』～~-'.split('').concat(['……', '——']));
const errors = [], warnings = [];
const E = (m) => errors.push(m), W = (m) => warnings.push(m);
const strict = li <= 1; // HSK1-2: only taught words
const MIN_SENT = { '1': 14, '2': 14, '3': 14, '4': 14, '5': 12, '6': 12, adv: 12 }[lvl];
const partition = fs.existsSync(path.join(B, 'inputs', `hsk${lvl}_units.json`)) ? JSON.parse(fs.readFileSync(path.join(B, 'inputs', `hsk${lvl}_units.json`), 'utf8')) : null;

if (!Array.isArray(C.units) || !C.units.length) { console.error('units[] missing'); process.exit(1); }
if (partition && C.units.length !== partition.length) E(`expected ${partition.length} units (one per partition chunk), got ${C.units.length}`);

const seen = new Map();
const taught = new Set(lower);
const ids = new Set();
let totalSent = 0, covered = 0, totalWords = 0;

function canSegment(tok, known) {
  // true if tok can be split fully into known words (max 4 chars each) or digits/latin
  const n = tok.length; const ok = new Array(n + 1).fill(false); ok[0] = true;
  for (let i = 0; i < n; i++) if (ok[i]) for (let j = i + 1; j <= Math.min(n, i + 6); j++) {
    const s = tok.slice(i, j);
    if (known.has(s) || /^[0-9A-Za-z%.]+$/.test(s)) ok[j] = true;
  }
  return ok[n];
}
function checkZh(where, zh, extra, unitTaught) {
  if (typeof zh !== 'string' || !zh.trim()) { E(`${where}: empty zh`); return []; }
  if (/\s{2,}/.test(zh)) W(`${where}: double spaces`);
  const toks = zh.trim().split(' ');
  for (const t of toks) {
    if (PUNCT.has(t) || /^[\p{P}\p{S}]+$/u.test(t)) continue;
    if (/[\p{P}]/u.test(t)) { E(`${where}: punctuation glued to token "${t}" — separate it with a space`); continue; }
    if (/^[0-9A-Za-z%.:]+$/.test(t)) continue;
    if (extra[t]) continue;
    const known = strict ? unitTaught : (li <= 2 ? allUpTo : allUpTo);
    if (known.has(t) || canSegment(t, new Set([...known, ...Object.keys(extra)]))) {
      if (li === 2 && !unitTaught.has(t) && !canSegment(t, unitTaught)) W(`${where}: "${t}" is HSK${lvl} but taught in a later unit`);
      continue;
    }
    if (li >= 3 && LEVELS.slice(li + 1).some(l => false)) {}
    (strict || li === 2 ? E : W)(`${where}: unknown word "${t}" (not in HSK≤${lvl} lists or unit.extra)`);
  }
  return toks;
}
function checkQuestions(where, qs, min) {
  if (!Array.isArray(qs) || qs.length < min) { E(`${where}: needs ≥${min} questions`); return; }
  qs.forEach((q, i) => {
    if (!q.q) E(`${where} q${i}: missing q`);
    if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length > 4) E(`${where} q${i}: needs 3-4 options`);
    else if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)) E(`${where} q${i}: bad answer index`);
    if (new Set(q.options || []).size !== (q.options || []).length) E(`${where} q${i}: duplicate options`);
  });
}

C.units.forEach((u, ui) => {
  const W0 = `unit ${ui + 1} (${u.id || '?'})`;
  if (!u.id || ids.has(u.id)) E(`${W0}: missing/duplicate id`); ids.add(u.id);
  for (const k of ['title', 'titleZh', 'goal']) if (!u[k]) E(`${W0}: missing ${k}`);
  if (!Array.isArray(u.words) || !u.words.length) { E(`${W0}: words[] missing`); return; }
  if (partition && partition[ui]) {
    const a = new Set(partition[ui]), b = new Set(u.words);
    const miss = [...a].filter(x => !b.has(x)), add = [...b].filter(x => !a.has(x));
    if (miss.length || add.length) E(`${W0}: words must equal inputs partition chunk ${ui + 1}. missing: ${miss.slice(0, 10).join(' ')} extra: ${add.slice(0, 10).join(' ')}`);
  }
  u.words.forEach(w => {
    if (!levelSet.has(w)) E(`${W0}: word "${w}" is not in the HSK${lvl} list`);
    if (seen.has(w)) E(`${W0}: word "${w}" already used in unit ${seen.get(w)}`);
    seen.set(w, ui + 1);
  });
  const extra = u.extra || {};
  for (const [k, v] of Object.entries(extra)) if (!v || typeof v !== 'string') E(`${W0}: extra["${k}"] needs an English gloss`);
  if (li <= 2) {
    const g = u.glosses || {};
    u.words.forEach(w => { if (!g[w]) E(`${W0}: glosses["${w}"] missing`); else if (g[w].length > 40) W(`${W0}: gloss for ${w} is long (${g[w].length} chars)`); });
  }
  for (const [k, v] of Object.entries(u.glosses || {})) if (!u.words.includes(k)) W(`${W0}: gloss for "${k}" which is not a unit word`);
  for (const [k, v] of Object.entries(u.pinyin || {})) { if (!u.words.includes(k)) W(`${W0}: pinyin override for non-unit word ${k}`); if (!/^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+$/.test(v)) E(`${W0}: pinyin override "${v}" must use tone marks`); }
  u.words.forEach(w => taught.add(w));
  const unitTaught = new Set([...taught, ...Object.keys(extra)]);
  // grammar
  if (!Array.isArray(u.grammar) || !u.grammar.length) E(`${W0}: grammar[] needs ≥1 point`);
  (u.grammar || []).forEach((g, gi) => {
    for (const k of ['title', 'pattern', 'explain']) if (!g[k]) E(`${W0} grammar ${gi}: missing ${k}`);
    if (!Array.isArray(g.examples) || g.examples.length < 2) E(`${W0} grammar ${gi}: needs ≥2 examples`);
    (g.examples || []).forEach((ex, xi) => { checkZh(`${W0} grammar ${gi} ex ${xi}`, ex.zh, extra, unitTaught); if (!ex.en) E(`${W0} grammar ${gi} ex ${xi}: missing en`); });
  });
  // sentences
  const sents = u.sentences || [];
  if (sents.length < MIN_SENT) E(`${W0}: needs ≥${MIN_SENT} sentences, has ${sents.length}`);
  const used = new Set();
  sents.forEach((s, si) => {
    const toks = checkZh(`${W0} s${si}`, s.zh, extra, unitTaught);
    if (!s.en) E(`${W0} s${si}: missing en`);
    toks.forEach(t => used.add(t));
    (s.alt || []).forEach((a, ai) => {
      const at = checkZh(`${W0} s${si} alt${ai}`, a, extra, unitTaught);
      const sortJ = x => x.filter(t => !PUNCT.has(t)).slice().sort().join('|');
      if (sortJ(at) !== sortJ(toks)) E(`${W0} s${si} alt${ai}: alt must use exactly the same tokens as zh, reordered`);
    });
    if (s.focus && !toks.includes(s.focus)) E(`${W0} s${si}: focus "${s.focus}" must be one of the tokens`);
  });
  totalSent += sents.length;
  const txt = sents.map(s => (s.zh || '').replace(/ /g, '')).join('') + (u.reading?.zh || '') + (u.dialogue?.lines || []).map(l => (l.zh || '').replace(/ /g, '')).join('');
  const cov = u.words.filter(w => used.has(w) || txt.includes(w));
  covered += cov.length; totalWords += u.words.length;
  // dialogue / reading
  const needDialogue = li <= 1, needReading = li >= 3;
  if (needDialogue && !u.dialogue) E(`${W0}: dialogue required for HSK${lvl}`);
  if (needReading && !u.reading) E(`${W0}: reading required for HSK${lvl}`);
  if (li === 2 && !u.dialogue && !u.reading) E(`${W0}: needs a dialogue or a reading`);
  if (u.dialogue) {
    const d = u.dialogue; if (!d.title) E(`${W0} dialogue: missing title`);
    if (!Array.isArray(d.lines) || d.lines.length < 4) E(`${W0} dialogue: needs ≥4 lines`);
    (d.lines || []).forEach((l, i) => { if (!l.who) E(`${W0} dialogue line ${i}: missing who`); checkZh(`${W0} dialogue line ${i}`, l.zh, extra, unitTaught); if (!l.en) E(`${W0} dialogue line ${i}: missing en`); });
    checkQuestions(`${W0} dialogue`, d.questions, 2);
  }
  if (u.reading) {
    const r = u.reading; if (!r.title) E(`${W0} reading: missing title`);
    if (!r.zh || / /.test(r.zh.trim()) && li >= 3) { if (!r.zh) E(`${W0} reading: missing zh`); else W(`${W0} reading: zh should be plain text without spaces`); }
    if (!r.en) E(`${W0} reading: missing en translation`);
    const minLen = { '2': 60, '3': 100, '4': 150, '5': 250, '6': 350, adv: 400 }[lvl] || 0;
    if (r.zh && r.zh.replace(/\s/g, '').length < minLen) E(`${W0} reading: too short (${r.zh.replace(/\s/g, '').length} chars, need ≥${minLen})`);
    checkQuestions(`${W0} reading`, r.questions, 3);
  }
  if (lvl === 'adv') {
    if (!Array.isArray(u.chengyu) || u.chengyu.length < 8) E(`${W0}: chengyu[] needs ≥8 entries`);
    (u.chengyu || []).forEach((c, ci) => { for (const k of ['zh', 'lit', 'en']) if (!c[k]) E(`${W0} chengyu ${ci}: missing ${k}`); if (!c.example || !c.example.zh || !c.example.en) E(`${W0} chengyu ${ci}: example {zh,en} required`); else if (/ /.test(c.example.zh)) W(`${W0} chengyu ${ci}: example.zh should be plain text`); });
  }
});
if (!partition) {
  const miss = levelWords.filter(w => !seen.has(w));
  if (miss.length) E(`level words not assigned to any unit (${miss.length}): ${miss.join(' ')}`);
}
const wl = quiet ? warnings.slice(0, 15) : warnings;
if (wl.length) console.log('WARNINGS (' + warnings.length + '):\n  ' + wl.join('\n  '));
if (errors.length) console.log('ERRORS (' + errors.length + '):\n  ' + errors.slice(0, 80).join('\n  '));
console.log(`\nunits ${C.units.length}, sentences ${totalSent}, unit-word coverage in sentences/texts ${(100 * covered / Math.max(1, totalWords)).toFixed(0)}%`);
console.log(errors.length ? 'FAIL' : 'OK');
process.exit(errors.length ? 1 : 0);
