/** The course: stages → units → lessons, and generation of exercises for each lesson. */
import type { Core, Item, Lesson, Level, LevelKey, Sentence, Unit, UnitData, Word } from './types';
import { D, loadLevel, loadLevelsUpTo, sylChar, word, hasStrokes } from './data';
import { isHan, isPunct, hanOnly, parseMarked } from './pinyin';
import { pick, sampleN, shuffle, uniqBy } from './util';
import { audioAvailable as ttsAvailable, prefetchAudio, loadAudioIndex } from './audio';
import { getProgress, speakingOn } from '../state/progress';
import { strength } from './srs';

export const LEVEL_ORDER: LevelKey[] = ['0', '1', '2', '3', '4', '5', '6', 'adv'];
export const LEVEL_META: Record<LevelKey, Omit<Level, 'key' | 'units'>> = {
  '0': { name: 'Sounds', short: 'Pinyin', hz: '音', title: 'Pinyin & tones', blurb: 'Hear and produce every sound and tone of Mandarin.', cefr: 'Start' },
  '1': { name: 'HSK 1', short: 'HSK 1', hz: '一', title: 'First words', blurb: 'Greetings, numbers, family, food and time.', cefr: 'A1' },
  '2': { name: 'HSK 2', short: 'HSK 2', hz: '二', title: 'Everyday basics', blurb: 'Routines, shopping, health and travel.', cefr: 'A1+' },
  '3': { name: 'HSK 3', short: 'HSK 3', hz: '三', title: 'Getting around', blurb: 'Handle daily life in Chinese.', cefr: 'A2' },
  '4': { name: 'HSK 4', short: 'HSK 4', hz: '四', title: 'Real conversations', blurb: 'Discuss work, travel, health and opinions.', cefr: 'B1' },
  '5': { name: 'HSK 5', short: 'HSK 5', hz: '五', title: 'Fluent reading', blurb: 'Read articles, follow films, give talks.', cefr: 'B2' },
  '6': { name: 'HSK 6', short: 'HSK 6', hz: '六', title: 'Near native', blurb: 'Understand almost anything you hear or read.', cefr: 'C1' },
  adv: { name: 'Mastery', short: 'Mastery', hz: '精', title: 'Native nuance', blurb: 'Idioms, register, humour and literary echoes.', cefr: 'C2' },
};
const BATCH: Record<string, number> = { '1': 5, '2': 5, '3': 6, '4': 8, '5': 10, '6': 10, adv: 10 };

// ---------- Stage 0 ----------
interface PUnit { id: string; title: string; titleZh: string; goal: string; kind: 'tones' | 'sounds' | 'pairs'; syl?: string[]; note?: string }
export const P_UNITS: PUnit[] = [
  { id: 'p1', title: 'The four tones', titleZh: '声调', goal: 'Hear the four tones and say them with the right pitch.', kind: 'tones', syl: ['ma', 'ba', 'da', 'ta', 'yi', 'wu', 'yu', 'ni', 'mi', 'bi', 'di', 'li', 'tu', 'gu', 'he', 'shi'] },
  { id: 'p2', title: 'Lips & tongue tip', titleZh: '唇音', goal: 'Tell b/p, d/t, m, f, n and l apart with the simple vowels.', kind: 'sounds',
    syl: ['ba', 'pa', 'ma', 'fa', 'da', 'ta', 'na', 'la', 'bo', 'po', 'mo', 'fo', 'de', 'te', 'ne', 'le', 'bi', 'pi', 'mi', 'di', 'ti', 'ni', 'li', 'bu', 'pu', 'mu', 'fu', 'du', 'tu', 'nu', 'lu', 'nü', 'lü'],
    note: 'b, d and g are not voiced like English: they have no puff of air. p, t and k have a strong puff. Hold your hand in front of your mouth: pà should push air, bà should not.' },
  { id: 'p3', title: 'Back of the tongue & j q x', titleZh: '舌根音', goal: 'Say g/k/h and the palatal j/q/x correctly.', kind: 'sounds',
    syl: ['ge', 'ke', 'he', 'gu', 'ku', 'hu', 'ga', 'ka', 'ha', 'ji', 'qi', 'xi', 'ju', 'qu', 'xu', 'jia', 'qia', 'xia', 'jie', 'qie', 'xie'],
    note: 'h is rougher than English h. j, q and x use the flat front of the tongue against the lower teeth: j is like “jee” without voicing, q like “chee” with a puff, x between “see” and “she”. After j, q and x, the letter u is really ü.' },
  { id: 'p4', title: 'zh ch sh r & z c s', titleZh: '翘舌音', goal: 'Distinguish curled-tongue zh/ch/sh/r from flat z/c/s.', kind: 'sounds',
    syl: ['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si', 'zha', 'cha', 'sha', 'za', 'ca', 'sa', 'zhu', 'chu', 'shu', 'ru', 'zu', 'cu', 'su', 'zhe', 'che', 'she', 're', 'ze', 'ce', 'se'],
    note: 'For zh, ch, sh and r, curl the tongue tip up behind the gum ridge. For z, c and s keep it flat behind the teeth; c sounds like “ts” in “cats”. In zhi, chi, shi, ri, zi, ci and si the i is a buzzing continuation of the consonant, not “ee”.' },
  { id: 'p5', title: 'Compound finals', titleZh: '复韵母', goal: 'Hear and spell ai, ei, ao, ou, ia, ie, ua, uo, üe, iao, iu, uai and ui.', kind: 'sounds',
    syl: ['bai', 'mei', 'hao', 'dou', 'jia', 'xie', 'hua', 'duo', 'xue', 'jiao', 'liu', 'kuai', 'gui', 'lai', 'gei', 'pao', 'zou', 'xia', 'bie', 'gua', 'cuo', 'yue', 'piao', 'niu', 'huai', 'dui'],
    note: 'iu is short for iou (liù sounds like “lyoh”), ui for uei (guì ≈ “gway”). The tone mark goes on a, then e, then o; in iu and ui it goes on the second vowel.' },
  { id: 'p6', title: 'Nasal finals', titleZh: '鼻韵母', goal: 'Tell -n from -ng and spell the nasal finals.', kind: 'sounds',
    syl: ['an', 'ang', 'ban', 'bang', 'fen', 'feng', 'min', 'ming', 'xin', 'xing', 'tong', 'dong', 'nian', 'niang', 'qian', 'qiang', 'huan', 'huang', 'chuan', 'chuang', 'lun', 'jun', 'yuan', 'xiong', 'ren', 'reng', 'shan', 'shang'],
    note: '-n ends with the tongue tip on the gum ridge, like English “run”. -ng ends at the back, like “sung”. ang and eng also sound darker than an and en.' },
  { id: 'p7', title: 'Tone pairs & tone changes', titleZh: '变调', goal: 'Hear tones in real words and apply the 3-3, 一 and 不 tone changes.', kind: 'pairs',
    note: 'Two 3rd tones in a row: the first becomes a 2nd tone (你好 nǐ hǎo is said ní hǎo). 不 bù becomes bú before a 4th tone (不是 bú shì). 一 yī becomes yí before a 4th tone (一个 yí gè) and yì before other tones (一起 yì qǐ). Neutral-tone syllables are short and light, like the second 妈 in 妈妈 māma.' },
];
const PAIR_WORDS: [string, string][] = [
  ['你好', 'nǐ hǎo'], ['谢谢', 'xiè xie'], ['老师', 'lǎo shī'], ['学生', 'xué sheng'], ['中国', 'zhōng guó'], ['朋友', 'péng you'], ['喜欢', 'xǐ huan'],
  ['明天', 'míng tiān'], ['今天', 'jīn tiān'], ['昨天', 'zuó tiān'], ['电脑', 'diàn nǎo'], ['飞机', 'fēi jī'], ['米饭', 'mǐ fàn'], ['水果', 'shuǐ guǒ'],
  ['医生', 'yī shēng'], ['商店', 'shāng diàn'], ['电影', 'diàn yǐng'], ['再见', 'zài jiàn'], ['名字', 'míng zi'], ['妈妈', 'mā ma'], ['爸爸', 'bà ba'],
  ['北京', 'běi jīng'], ['汉语', 'hàn yǔ'], ['苹果', 'píng guǒ'], ['天气', 'tiān qì'], ['睡觉', 'shuì jiào'], ['工作', 'gōng zuò'], ['学习', 'xué xí'],
  ['可以', 'kě yǐ'], ['我们', 'wǒ men'], ['什么', 'shén me'], ['现在', 'xiàn zài'], ['上午', 'shàng wǔ'], ['下雨', 'xià yǔ'], ['杯子', 'bēi zi'], ['衣服', 'yī fu'],
];
const SANDHI_ITEMS = [
  { zh: '你好', said: 'ní hǎo', cite: 'nǐ hǎo', rule: '3 + 3 → 2 + 3' }, { zh: '很好', said: 'hén hǎo', cite: 'hěn hǎo', rule: '3 + 3 → 2 + 3' },
  { zh: '可以', said: 'ké yǐ', cite: 'kě yǐ', rule: '3 + 3 → 2 + 3' }, { zh: '水果', said: 'shuí guǒ', cite: 'shuǐ guǒ', rule: '3 + 3 → 2 + 3' },
  { zh: '不是', said: 'bú shì', cite: 'bù shì', rule: '不 before a 4th tone → bú' }, { zh: '不去', said: 'bú qù', cite: 'bù qù', rule: '不 before a 4th tone → bú' },
  { zh: '不好', said: 'bù hǎo', cite: 'bù hǎo', rule: '不 stays bù before tones 1–3' }, { zh: '一个', said: 'yí gè', cite: 'yī gè', rule: '一 before a 4th tone → yí' },
  { zh: '一起', said: 'yì qǐ', cite: 'yī qǐ', rule: '一 before tones 1–3 → yì' }, { zh: '一天', said: 'yì tiān', cite: 'yī tiān', rule: '一 before tones 1–3 → yì' },
];

// ---------- path ----------
let LEVELS: Level[] = [];
let PATH: Lesson[] = [];
let BY_ID = new Map<string, Lesson>();

export function buildCourse(core: Core) {
  LEVELS = LEVEL_ORDER.map(k => {
    if (k === '0') return { key: k, ...LEVEL_META[k], units: P_UNITS.map(u => ({ ...u, nw: 0, g: 0, s: 0, d: 0, r: 0, c: 0, level: k, lessons: [] })) } as Level;
    const L = core.levels.find(l => l.key === k);
    return { key: k, ...LEVEL_META[k], units: (L?.units || []).map(u => ({ ...u, level: k, lessons: [] })), pending: !L } as Level;
  });
  PATH = [];
  for (const L of LEVELS) for (const u of L.units) { u.lessons = lessonsForUnit(L.key, u); u.lessons.forEach(l => { l.pos = PATH.length; PATH.push(l); }); }
  BY_ID = new Map(PATH.map(l => [l.id, l]));
}
function lessonsForUnit(k: LevelKey, u: Unit): Lesson[] {
  const out: Lesson[] = []; const base = { level: k, unitId: u.id, pos: 0 };
  if (k === '0') {
    if (u.kind === 'tones') out.push({ ...base, id: u.id + '-a', kind: 'p-tones-intro', title: 'Meet the tones', sub: 'Listen' }, { ...base, id: u.id + '-b', kind: 'p-tones-ear', title: 'Tone ear training', sub: 'Listen' }, { ...base, id: u.id + '-c', kind: 'p-tones-say', title: 'Say the tones', sub: 'Speak' });
    else if (u.kind === 'sounds') out.push({ ...base, id: u.id + '-a', kind: 'p-sounds-ear', title: 'Hear the sounds', sub: 'Listen' }, { ...base, id: u.id + '-b', kind: 'p-sounds-type', title: 'Write what you hear', sub: 'Type pinyin' });
    else out.push({ ...base, id: u.id + '-a', kind: 'p-pairs', title: 'Tones in words', sub: 'Listen' }, { ...base, id: u.id + '-b', kind: 'p-sandhi', title: 'Tone changes', sub: 'Rules' });
    out.push({ ...base, id: u.id + '-x', kind: 'p-test', title: 'Checkpoint', sub: 'Pass with 80%', test: true });
    return out;
  }
  const b = BATCH[k] || 8; const nb = Math.max(1, Math.ceil(u.nw / b));
  for (let i = 0; i < nb; i++) out.push({ ...base, id: `${u.id}-w${i + 1}`, kind: 'words', idx: i, batch: b, title: `New words ${i + 1}`, sub: `${Math.min(b, u.nw - i * b)} words` });
  if (u.g) out.push({ ...base, id: u.id + '-g', kind: 'grammar', title: 'Grammar', sub: `${u.g} pattern${u.g > 1 ? 's' : ''}` });
  if (u.s) out.push({ ...base, id: u.id + '-s', kind: 'sentences', title: 'Sentences', sub: 'Build, listen, speak' });
  if (u.d || u.r) out.push({ ...base, id: u.id + '-t', kind: 'story', title: u.r ? 'Reading' : 'Dialogue', sub: 'Comprehension' });
  if (u.c) out.push({ ...base, id: u.id + '-c', kind: 'chengyu', title: 'Idioms', sub: `${u.c} chengyu` });
  out.push({ ...base, id: u.id + '-x', kind: 'test', title: 'Unit test', sub: 'Pass with 80%', test: true });
  return out;
}
export const levels = () => LEVELS;
export const path = () => PATH;
export const lessonById = (id: string) => BY_ID.get(id);
export const levelOf = (k: LevelKey) => LEVELS.find(l => l.key === k)!;
export const unitOf = (l: Lesson) => levelOf(l.level).units.find(u => u.id === l.unitId)!;
export const isDone = (id: string, done = getProgress().done) => !!done[id];
export function nextLesson(done = getProgress().done): Lesson | null { return PATH.find(l => !done[l.id]) || null; }
export function unitProgress(u: Unit, done = getProgress().done) { const n = u.lessons.filter(l => done[l.id]).length; return { done: n, total: u.lessons.length }; }
export function levelProgress(L: Level, done = getProgress().done) { let d = 0, t = 0; for (const u of L.units) { const p = unitProgress(u, done); d += p.done; t += p.total; } return { done: d, total: t }; }

/** Mark everything before `pos` complete and seed the words of completed units as known. Returns words seeded. */
export async function completeUpTo(pos: number, store: { set: (fn: (p: any) => void) => void; seedKnown: (l: { w: string; level: string }[]) => void }) {
  store.set(p => { for (const l of PATH) { if (l.pos >= pos) break; if (!p.done[l.id]) p.done[l.id] = { best: 80, n: 0, at: Date.now(), skipped: true }; } });
  const done = getProgress().done;
  const seeds: { w: string; level: string }[] = [];
  for (const k of new Set(PATH.slice(0, pos).map(l => l.level).filter(k => k !== '0'))) {
    const L = await loadLevel(k); if (!L) continue;
    for (const u of L.units) if (levelOf(k).units.find(x => x.id === u.id)!.lessons.every(l => done[l.id])) u.words.forEach(w => seeds.push({ w, level: k }));
  }
  store.seedKnown(seeds);
  return seeds.length;
}

// ---------- distractor quality ----------
const STOP = new Set(['to', 'a', 'an', 'the', 'of', 'sb', 'sth', 'm', 'for', 'and', 'or', 'be', 'in', 'on', 'at', 'with', 'one', "one's", 'is', 'it']);
const glossKeys = (g: string) => new Set(g.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z']+/).filter(w => w.length > 1 && !STOP.has(w)));
function overlaps(a: string, b: string) { const A = glossKeys(a); for (const w of glossKeys(b)) if (A.has(w)) return true; return false; }

const levelPoolCache = new Map<string, string[]>();
export function levelPool(k: LevelKey): string[] {
  if (!levelPoolCache.has(k)) { const L = D.levels[k]; if (!L) return []; levelPoolCache.set(k, L.units.flatMap(u => u.words)); }
  return levelPoolCache.get(k)!;
}
function distractorWords(w: string, pool: string[], n: number, key: 'g' | 'zh' = 'g'): Word[] {
  const tw = word(w)!;
  const cands = uniqBy(pool.filter(x => x !== w).map(word).filter((x): x is Word => !!x && !x.extra && !!x[key] && x[key] !== tw[key] && x.zh !== tw.zh && !overlaps(x.g, tw.g)), x => x[key]);
  const sim = shuffle(cands).sort((a, b) => Math.abs(a.zh.length - tw.zh.length) - Math.abs(b.zh.length - tw.zh.length));
  return shuffle(sim.slice(0, n * 3)).slice(0, n);
}
const tokensOf = (s: Sentence) => s.t.filter(t => !isPunct(t));
function knownSet(k: LevelKey, unit: UnitData, upToWordIdx: number): Set<string> {
  const s = new Set<string>();
  for (const lk of LEVEL_ORDER) {
    if (lk === '0') continue;
    const L = D.levels[lk]; if (!L) continue;
    if (lk === k) { for (const u of L.units) { if (u.id === unit.id) { u.words.slice(0, upToWordIdx).forEach(w => s.add(w)); break; } u.words.forEach(w => s.add(w)); } break; }
    L.units.forEach(u => u.words.forEach(w => s.add(w)));
  }
  return s;
}
const sentenceKnown = (s: Sentence, known: Set<string>, extra: Record<string, string>) => tokensOf(s).every(t => known.has(t) || extra[t] || /^[0-9]+$/.test(t));

export function wordExercises(w: string, k: LevelKey, pool: string[], opts: { speak?: boolean; write?: boolean } = {}): Item[] {
  const W = word(w); if (!W) return [];
  const list: Item[] = [];
  const dis = distractorWords(w, pool, 3), disHz = distractorWords(w, pool, 3, 'zh');
  if (dis.length >= 2) list.push({ type: 'mc_meaning', w, options: shuffle([W, ...dis]), words: [w], level: k });
  if (disHz.length >= 2) list.push({ type: 'mc_hanzi', w, options: shuffle([W, ...disHz]), words: [w], level: k });
  if (ttsAvailable() && disHz.length >= 2) list.push({ type: 'listen_pick', w, options: shuffle([W, ...distractorWords(w, pool, 3, 'zh')]), words: [w], level: k });
  if (W.py) {
    if ((k === '1' || k === '2') && parseMarked(W.py).length <= 3) list.push({ type: 'tones', w, words: [w], level: k });
    list.push({ type: 'type_pinyin', w, words: [w], level: k });
  }
  if (opts.speak && speakingOn() && W.zh.length <= 6) list.push({ type: 'speak', text: W.zh, py: W.py, en: W.g, words: [w], level: k, isWord: true });
  if (opts.write && getProgress().settings.writing && [...W.zh].length <= 3 && [...W.zh].every(ch => isHan(ch) && hasStrokes(ch))) list.push({ type: 'write', w, words: [w], level: k });
  return list;
}
export function sentenceExercises(s: Sentence, unit: UnitData, k: LevelKey, kinds: string[], pool: string[]): Item[] {
  const toks = tokensOf(s); const out: Item[] = []; const extra = unit.extra || {};
  const listWords = toks.filter(t => word(t) && !word(t)!.extra);
  const distractTiles = (n: number) => sampleN(pool.filter(x => !toks.includes(x) && x.length <= 4), n);
  for (const kind of kinds) {
    if (kind === 'build' && toks.length >= 2 && toks.length <= 14) out.push({ type: 'build', s, extraTiles: distractTiles(toks.length > 8 ? 2 : 3), words: listWords, level: k });
    if (kind === 'listen_build' && ttsAvailable() && toks.length >= 2 && toks.length <= 12) out.push({ type: 'listen_build', s, extraTiles: distractTiles(2), words: listWords, level: k });
    if (kind === 'mc_translate') {
      const others = sampleN((unit.sentences || []).filter(x => x !== s && x.en !== s.en && x.t.join('') !== s.t.join('')), 2);
      if (others.length === 2) out.push({ type: 'mc_translate', s, options: shuffle([s.en, ...others.map(o => o.en)]), words: listWords, level: k });
    }
    if (kind === 'fill') {
      let fi = s.f;
      if (fi == null || fi < 0) { const cand = s.t.map((t, i) => [t, i] as const).filter(([t]) => unit.words.includes(t)); if (cand.length) fi = pick(cand)[1]; }
      if (fi != null && fi >= 0) {
        const ans = s.t[fi]; const aw = word(ans);
        const base = pool.filter(x => x !== ans && !s.t.includes(x) && Math.abs(x.length - ans.length) <= 1).map(word).filter((x): x is Word => !!x && !x.extra && (!aw || !overlaps(x.g, aw.g)));
        // prefer a different part of speech so only one option fits grammatically
        const diffPos = base.filter(x => aw?.pos && x.pos && x.pos[0] !== aw.pos[0]);
        const opts = uniqBy(shuffle(diffPos.length >= 3 ? diffPos : base), x => x.zh).slice(0, 3).map(x => x.zh);
        if (opts.length === 3) out.push({ type: 'fill', s, idx: fi, options: shuffle([ans, ...opts]), words: aw && !aw.extra ? [ans] : [], level: k });
      }
    }
    if (kind === 'speak' && speakingOn() && toks.length <= 14) out.push({ type: 'speak', text: s.t.join(''), toks: s.t, pys: s.p, en: s.en, words: [], level: k });
  }
  return out;
}

// ---------- lesson generators ----------
export async function buildLesson(lesson: Lesson): Promise<Item[]> {
  const k = lesson.level;
  if (k === '0') return buildPinyinLesson(lesson);
  await loadLevelsUpTo(k, LEVEL_ORDER);
  const L = await loadLevel(k); if (!L) throw new Error('Level data missing');
  const unit = L.units.find(u => u.id === lesson.unitId)!;
  await Promise.race([loadAudioIndex(k), new Promise(r => setTimeout(r, 4000))]);
  prefetchAudio(unit.id);
  const pool = levelPool(k);
  const items: Item[] = [];
  const high = !['1', '2', '3'].includes(k);
  if (lesson.kind === 'words') {
    const b = lesson.batch!, start = lesson.idx! * b, words = unit.words.slice(start, start + b), prior = unit.words.slice(0, start);
    const known = knownSet(k, unit, start + b);
    for (let i = 0; i < words.length; i += 4) {
      const ch = words.slice(i, i + 4);
      ch.forEach(w => items.push({ type: 'intro', w, words: [w], level: k, unit, intro: true }));
      const prac: Item[] = [];
      ch.forEach((w, wi) => {
        const set = wordExercises(w, k, pool, { speak: wi % 2 === 0, write: high ? wi === 0 : wi % 2 === 1 });
        const mc = set.filter(e => e.type.startsWith('mc_') || e.type === 'listen_pick');
        const prod = set.filter(e => !(e.type.startsWith('mc_') || e.type === 'listen_pick'));
        prac.push(...sampleN(mc, high ? 1 : 2), ...sampleN(prod, high && wi % 2 ? 0 : 1));
      });
      const pairs = ch.map(w => word(w)).filter((x): x is Word => !!x);
      if (pairs.length >= 3 && uniqBy(pairs, p => p.g).length === pairs.length) prac.push({ type: 'match', pairs, words: [], level: k });
      items.push(...shuffle(prac));
    }
    const sents = shuffle((unit.sentences || []).filter(s => words.some(w => s.t.includes(w)) && sentenceKnown(s, known, unit.extra)));
    sents.slice(0, Math.min(3, Math.ceil(words.length / 2))).forEach((s, i) => items.push(...sampleN(sentenceExercises(s, unit, k, i % 2 ? ['mc_translate', 'listen_build'] : ['build', 'fill'], pool), 1)));
    sampleN(prior, 2).forEach(w => items.push(...sampleN(wordExercises(w, k, pool), 1)));
  } else if (lesson.kind === 'grammar') {
    for (const g of unit.grammar) {
      items.push({ type: 'grammar_card', g, level: k, intro: true });
      const key = hanOnly(g.pattern);
      g.examples.forEach((ex, i) => {
        const s: Sentence = { ...ex, alt: ex.alt || [] };
        const fi = s.t.findIndex(t => t && key.includes(t) && !isPunct(t));
        const exs: Item[] = [];
        if (fi >= 0) exs.push(...sentenceExercises({ ...s, f: fi }, unit, k, ['fill'], pool));
        exs.push(...sentenceExercises(s, unit, k, [i % 2 ? 'listen_build' : 'build'], pool));
        items.push(...exs.slice(0, 2));
      });
      const related = (unit.sentences || []).filter(s => key && s.t.some(t => t.length && key.includes(t) && !isPunct(t)));
      sampleN(related, 3).forEach(s => items.push(...sampleN(sentenceExercises(s, unit, k, ['build', 'fill', 'mc_translate'], pool), 1)));
    }
  } else if (lesson.kind === 'sentences') {
    const kinds = ['build', 'listen_build', 'mc_translate', 'fill', 'speak', 'build'];
    shuffle(unit.sentences || []).slice(0, 12).forEach((s, i) => {
      const e = sentenceExercises(s, unit, k, [kinds[i % kinds.length]], pool);
      items.push(...(e.length ? e : sentenceExercises(s, unit, k, ['mc_translate', 'build'], pool).slice(0, 1)));
    });
  } else if (lesson.kind === 'story') {
    if (unit.dialogue) {
      items.push({ type: 'dialogue_card', d: unit.dialogue, level: k, intro: true });
      unit.dialogue.questions.forEach(q => items.push({ type: 'question', q, ref: unit.dialogue, level: k }));
      sampleN(unit.dialogue.lines.filter(l => l.t.length <= 14), 2).forEach(l => items.push(...sentenceExercises({ t: l.t, p: l.p, en: l.en }, unit, k, ['speak', 'listen_build'], pool).slice(0, 1)));
    }
    if (unit.reading) {
      items.push({ type: 'reading_card', r: unit.reading, level: k, intro: true });
      unit.reading.questions.forEach(q => items.push({ type: 'question', q, ref: unit.reading, level: k }));
    }
  } else if (lesson.kind === 'chengyu') {
    const cy = unit.chengyu || [];
    cy.forEach(c => items.push({ type: 'chengyu_card', c, level: k, intro: true }));
    cy.forEach(c => items.push({ type: 'mc_chengyu', c, options: shuffle([c, ...sampleN(cy.filter(x => x !== c), 3)]), level: k }));
    shuffle(cy).slice(0, 4).forEach(c => items.push({ type: 'fill_chengyu', c, options: shuffle([c, ...sampleN(cy.filter(x => x !== c), 3)]), level: k }));
  } else if (lesson.kind === 'test') {
    return buildUnitTest(unit, k, pool);
  }
  return items;
}
export function buildUnitTest(unit: UnitData, k: LevelKey, pool: string[], size = 18): Item[] {
  const head: Item[] = [];
  shuffle(unit.words).slice(0, Math.ceil(size * 0.5)).forEach((w, i) => head.push(...sampleN(wordExercises(w, k, pool, { speak: i % 4 === 0, write: i % 5 === 1 && ['1', '2', '3'].includes(k) }), 1)));
  shuffle(unit.sentences || []).slice(0, Math.ceil(size * 0.35)).forEach((s, i) => head.push(...sampleN(sentenceExercises(s, unit, k, i % 2 ? ['build', 'listen_build'] : ['mc_translate', 'fill'], pool), 1)));
  if (unit.chengyu?.length) { const c = pick(unit.chengyu); head.push({ type: 'mc_chengyu', c, options: shuffle([c, ...sampleN(unit.chengyu.filter(x => x !== c), 3)]), level: k }); }
  const tail: Item[] = [];
  if (unit.reading) tail.push({ type: 'reading_card', r: unit.reading, level: k, intro: true }, { type: 'question', q: pick(unit.reading.questions), ref: unit.reading, level: k });
  else if (unit.dialogue) tail.push({ type: 'dialogue_card', d: unit.dialogue, level: k, intro: true }, { type: 'question', q: pick(unit.dialogue.questions), ref: unit.dialogue, level: k });
  return [...shuffle(head), ...tail];
}
export async function buildLevelTest(k: LevelKey, size = 20): Promise<Item[]> {
  await loadLevelsUpTo(k, LEVEL_ORDER);
  const L = await loadLevel(k); if (!L) return [];
  const pool = levelPool(k); const items: Item[] = [];
  sampleN(pool, Math.ceil(size * 0.6)).forEach(w => items.push(...sampleN(wordExercises(w, k, pool).filter(e => e.type !== 'speak' && e.type !== 'write'), 1)));
  for (let i = 0; i < Math.ceil(size * 0.4); i++) { const u = pick(L.units); const s = pick(u.sentences || []); if (s) items.push(...sampleN(sentenceExercises(s, u, k, ['build', 'mc_translate', 'fill'], pool), 1)); }
  return shuffle(items).slice(0, size);
}

// ---------- pinyin lessons ----------
/** A common character for a syllable+tone (HSK 1–5 preferred), so the voice reads it reliably. */
function commonSyl(b: string, t: number, strict = true): string | null {
  const ch = sylChar(b, t); if (!ch) return null;
  const lv = D.core?.charLevel[ch];
  return !strict || (lv && lv !== 'adv' && lv !== '6') ? ch : null;
}
function sylItems(u: PUnit, n: number, mk: (b: string, t: number, ch: string) => Item): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < n * 6 && out.length < n; i++) { const b = pick(u.syl!), t = 1 + Math.floor(Math.random() * 4), ch = commonSyl(b, t, i < n * 4); if (ch) out.push(mk(b, t, ch)); }
  return out;
}
function minimalPairs(u: PUnit, base: string, t: number) {
  const share = (a: string, b: string) => (a[0] === b[0] ? 1 : 0) + (a.slice(-1) === b.slice(-1) ? 1.5 : 0) + (a.length === b.length ? 0.5 : 0);
  const opts = u.syl!.filter(s => s !== base && sylChar(s, t)).sort((a, b) => share(b, base) - share(a, base));
  return shuffle(opts.slice(0, 5)).slice(0, 3);
}
function buildPinyinLesson(lesson: Lesson): Item[] {
  const u = P_UNITS.find(x => x.id === lesson.unitId)!;
  const audio = ttsAvailable();
  const toneListen = (base: string, t: number, ch: string): Item => ({ type: 'pin_tone_listen', base, t, ch, level: '0', visual: !audio });
  const pickItem = (base: string, t: number, ch: string): Item => { const o = minimalPairs(u, base, t); return o.length >= 2 && audio ? { type: 'pin_pick', base, t, ch, options: shuffle([base, ...o]), level: '0' } : toneListen(base, t, ch); };
  const typeItem = (base: string, t: number, ch: string): Item => (audio ? { type: 'pin_type', base, t, ch, level: '0' } : toneListen(base, t, ch));
  const sayItem = (base: string, t: number, ch: string): Item => ({ type: 'tone_speak', base, t, ch, level: '0' });
  const pairItem = ([zh, py]: [string, string]): Item => ({ type: 'tones', w: zh, wobj: { zh, py, g: '', en: '', l: '0' }, level: '0' });
  const sandhiItem = (it: typeof SANDHI_ITEMS[number]): Item => ({ type: 'sandhi', it, options: shuffle(uniqBy([it.said, it.cite, ...sampleN(SANDHI_ITEMS.filter(x => x !== it), 2).map(x => x.said)], x => x)).slice(0, 3), level: '0' });
  const items: Item[] = [];
  switch (lesson.kind) {
    case 'p-tones-intro': items.push({ type: 'pin_intro', topic: 'tones', level: '0', intro: true }); [1, 2, 3, 4, 1, 2, 3, 4].forEach(t => items.push(toneListen('ma', t, sylChar('ma', t)!))); break;
    case 'p-tones-ear': items.push(...sylItems(u, 14, toneListen)); break;
    case 'p-tones-say': items.push({ type: 'pin_intro', topic: 'say', level: '0', intro: true }); [1, 2, 3, 4].forEach(t => items.push(sayItem('ma', t, sylChar('ma', t)!))); items.push(...sylItems(u, 6, sayItem)); break;
    case 'p-sounds-ear': items.push({ type: 'pin_intro', topic: 'note', note: u.note, title: u.title, syl: u.syl!.slice(0, 10), level: '0', intro: true }); items.push(...sylItems(u, 12, pickItem), ...sylItems(u, 4, toneListen)); break;
    case 'p-sounds-type': items.push(...sylItems(u, 10, typeItem), ...sylItems(u, 3, sayItem)); break;
    case 'p-pairs': items.push({ type: 'pin_intro', topic: 'pairs', level: '0', intro: true }); sampleN(PAIR_WORDS, 12).forEach(p => items.push(pairItem(p))); break;
    case 'p-sandhi': items.push({ type: 'pin_intro', topic: 'note', note: u.note, title: u.title, level: '0', intro: true }); shuffle(SANDHI_ITEMS).forEach(it => items.push(sandhiItem(it))); break;
    case 'p-test':
      if (u.kind === 'tones') items.push(...sylItems(u, 12, toneListen), ...sylItems(u, 3, sayItem));
      else if (u.kind === 'sounds') items.push(...sylItems(u, 8, pickItem), ...sylItems(u, 6, typeItem), ...sylItems(u, 2, sayItem));
      else { sampleN(PAIR_WORDS, 10).forEach(p => items.push(pairItem(p))); sampleN(SANDHI_ITEMS, 4).forEach(it => items.push(sandhiItem(it))); }
      return shuffle(items);
  }
  return items;
}

// ---------- review & practice ----------
export async function buildReview(entries: { w: string; c: { l: string } & any }[]): Promise<Item[]> {
  await Promise.all([...new Set(entries.map(e => e.c.l as LevelKey))].filter(x => x !== '0').map(l => loadLevel(l).catch(() => null)));
  const items: Item[] = [];
  for (const { w, c } of entries) {
    if (!word(w)) continue;
    const k = c.l as LevelKey; const pool = levelPool(k); const st = strength(c);
    let set = wordExercises(w, k, pool, { speak: st >= 2, write: st >= 2 && ['1', '2', '3'].includes(k) });
    if (st <= 1) set = set.filter(e => /^(mc_|listen_pick|tones)/.test(e.type) || Math.random() < 0.3);
    const L = D.levels[k];
    if (L && Math.random() < 0.4) {
      const u = L.units.find(x => x.words.includes(w));
      const cands = u ? (u.sentences || []).filter(s => s.t.includes(w)) : [];
      if (u && cands.length) set.push(...sentenceExercises(pick(cands), u, k, [pick(['build', 'fill', 'mc_translate'])], pool));
    }
    const it = set.length ? pick(set) : null;
    if (it) items.push({ ...it, review: true, words: [w], level: k });
  }
  return items;
}
export function tonePracticeItems(withSpeaking: boolean): Item[] {
  const base = ['ma', 'ba', 'da', 'ni', 'hao', 'shi', 'wo', 'ta', 'yi', 'wu', 'yu', 'li', 'mi', 'tang', 'xue', 'zhong', 'guo', 'ren', 'shu', 'qi', 'fei', 'lai', 'mai', 'dou'];
  const items: Item[] = [];
  for (let i = 0; items.length < 14 && i < 60; i++) {
    const b = pick(base), t = 1 + Math.floor(Math.random() * 4), ch = commonSyl(b, t); if (!ch) continue;
    items.push(items.length % 2 && withSpeaking ? { type: 'tone_speak', base: b, t, ch, level: '0' } : { type: 'pin_tone_listen', base: b, t, ch, level: '0', visual: !ttsAvailable() });
  }
  return items;
}
