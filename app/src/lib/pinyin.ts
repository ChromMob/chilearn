/** Pinyin parsing and grading. Pure functions, fully unit-tested. */
const TONE_MARKS: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
const MARK_TO_BASE: Record<string, [string, number]> = {};
for (const [b, ms] of Object.entries(TONE_MARKS)) [...ms].forEach((m, i) => (MARK_TO_BASE[m] = [b, i + 1]));

export type Tone = 1 | 2 | 3 | 4 | 5;
export interface Syllable { base: string; tone: Tone }

export const isHan = (ch: string) => /\p{Script=Han}/u.test(ch);
export const isPunct = (t: string) => /^[\p{P}\p{S}\s]+$/u.test(t);
export const hanOnly = (s: string) => [...String(s)].filter(isHan).join('');

/** "nǐ hǎo" -> [{base:'ni',tone:3},{base:'hao',tone:3}] */
export function parseMarked(py: string): Syllable[] {
  return String(py).toLowerCase().normalize('NFC').replace(/[’']/g, ' ').split(/[\s\-]+/).filter(Boolean).map(s => {
    let tone: Tone = 5, base = '';
    for (const ch of s) {
      const m = MARK_TO_BASE[ch];
      if (m) { base += m[0]; tone = m[1] as Tone; } else base += ch;
    }
    return { base: base.replace(/[^a-zü]/g, ''), tone };
  }).filter(s => s.base);
}
/** "ni3" -> "nǐ" */
export function numToMark(syl: string): string {
  const m = /^([a-zü:v]+)([0-5])?$/i.exec(syl.trim());
  if (!m) return syl;
  const s = m[1].toLowerCase().replace(/u:|v/g, 'ü'); const t = Number(m[2] || 5);
  if (t === 5 || t === 0) return s;
  let idx = -1;
  if (s.includes('a')) idx = s.indexOf('a');
  else if (s.includes('e')) idx = s.indexOf('e');
  else if (s.includes('ou')) idx = s.indexOf('o');
  else for (let i = s.length - 1; i >= 0; i--) if ('iouü'.includes(s[i])) { idx = i; break; }
  if (idx < 0) return s;
  return s.slice(0, idx) + TONE_MARKS[s[idx]][t - 1] + s.slice(idx + 1);
}
export const stripTones = (s: string) => [...String(s).normalize('NFC')].map(ch => (MARK_TO_BASE[ch] ? MARK_TO_BASE[ch][0] : ch)).join('');

export interface PinyinInput { letters: string; tones: number[]; anyTone: boolean }
/** Normalize a learner answer: letters only + the sequence of non-neutral tones. Accepts marks or numbers, v/u: for ü. */
export function normPinyinInput(raw: string): PinyinInput {
  const s = String(raw).toLowerCase().normalize('NFC').replace(/u:|v/g, 'ü').replace(/[’'\-·.,，。!?！？]/g, ' ');
  const tones: number[] = []; let letters = ''; let anyTone = false;
  for (const ch of s) {
    const m = MARK_TO_BASE[ch];
    if (m) { letters += m[0]; tones.push(m[1]); anyTone = true; }
    else if (/[1-4]/.test(ch)) { tones.push(Number(ch)); anyTone = true; }
    else if (/[05]/.test(ch)) anyTone = true;
    else if (/[a-zü]/.test(ch)) letters += ch;
  }
  return { letters, tones, anyTone };
}
/** Acceptable tone sequences for a word: citation tones plus 一/不 and 3-3 sandhi variants (neutral tones removed). */
export function pinyinTargets(py: string, zh?: string) {
  const syl = parseMarked(py);
  const letters = syl.map(s => s.base).join('');
  const base = syl.map(s => s.tone as number);
  const variants: number[][] = [base];
  if (zh && [...zh].length === syl.length) {
    const chars = [...zh]; const alt = base.slice(); let changed = false;
    for (let i = 0; i < syl.length - 1; i++) {
      const next = base[i + 1];
      if (chars[i] === '一' && syl[i].base === 'yi') { alt[i] = next === 4 ? 2 : 4; changed = true; }
      if (chars[i] === '不' && syl[i].base === 'bu' && next === 4) { alt[i] = 2; changed = true; }
      if (base[i] === 3 && next === 3) { const v = base.slice(); v[i] = 2; variants.push(v); }
    }
    if (changed) variants.push(alt);
  }
  return { letters, syl, variants: variants.map(v => v.filter(t => t !== 5)) };
}
export type PinyinGrade = 'right' | 'tones' | 'wrong';
export function gradePinyin(input: string, py: string, zh?: string): PinyinGrade {
  const inp = normPinyinInput(input);
  const tgt = pinyinTargets(py, zh);
  if (inp.letters !== tgt.letters) return 'wrong';
  return tgt.variants.some(v => v.length === inp.tones.length && v.every((t, i) => t === inp.tones[i])) ? 'right' : 'tones';
}
