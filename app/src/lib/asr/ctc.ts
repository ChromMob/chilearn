/**
 * Pronunciation checking on CTC log-probabilities (frames × vocab) from the on-device model.
 *
 * Instead of trusting a free transcript (which a language model "corrects" towards the word you meant), every
 * expected syllable is tested against its rivals: the same syllable with other tones, similar-sounding syllables
 * (zh/z/j, an/ang, …), and leaving it out. If a rival explains the audio better than the expected text, the syllable
 * is marked: 'tone' (a tone rival won) or 'no' (a different sound, or nothing, was said).
 */
export interface Lexicon { v: string; parts: string[]; bytes: number; tokens: string[]; chars: Record<string, number[]>; alts: Record<string, string[]> }
export interface LogProbs { data: Float32Array; T: number; V: number }
/** One expected syllable: its character and reading (base spelled with v for ü, tone 1-4 or 0 for neutral). */
export interface Target { ch: string; base: string; tone: number }
export type Mark = 'ok' | 'tone' | 'no';
export interface Verdict { ch: string; mark: Mark; tone: number; heard?: string; soft?: boolean }

/** Score margins (nats): a rival must come within this much of the expected text to flag the syllable. */
export const TONE_MARGIN = 1.5, SOUND_MARGIN = 1.0;

// byte-level BPE: each byte is stored as a printable code point
const PRINTABLE: number[] = [];
const span = (a: number, b: number) => { for (let i = a; i <= b; i++) PRINTABLE.push(i); };
span(256, 287); span(32, 126); span(288, 305); span(308, 318); span(321, 328); span(330, 382); span(384, 422);
const CHAR_TO_BYTE = new Map(PRINTABLE.map((cp, b) => [String.fromCodePoint(cp), b]));

export function encode(lex: Lexicon, chars: string[]): number[] | null {
  const out: number[] = [];
  for (const c of chars) { const ids = lex.chars[c]; if (!ids) return null; out.push(...ids); }
  return out;
}

/** Best-path transcript (argmax per frame, repeats collapsed, blanks removed). */
export function greedy(lex: Lexicon, lp: LogProbs): string {
  const { data, T, V } = lp; let prev = -1; let s = '';
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -Infinity;
    for (let v = 0; v < V; v++) { const x = data[t * V + v]; if (x > bv) { bv = x; best = v; } }
    if (best !== prev && best > 2) s += lex.tokens[best];
    prev = best;
  }
  const bytes: number[] = [];
  for (const ch of s.replace(/▁/g, '')) { const b = CHAR_TO_BYTE.get(ch); if (b != null) bytes.push(b); }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).replace(/�/g, '');
}

const lae = (a: number, b: number) => (a === -Infinity ? b : b === -Infinity ? a : a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b)));
/** log P(labels | audio) summed over all CTC alignments. */
export function ctcScore(lp: LogProbs, ys: number[]): number {
  const { data, T, V } = lp; const L = 2 * ys.length + 1;
  if (!T) return -Infinity;
  const ext = new Int32Array(L); ys.forEach((y, i) => (ext[2 * i + 1] = y));
  let a = new Float64Array(L).fill(-Infinity), b = new Float64Array(L);
  a[0] = data[0]; if (L > 1) a[1] = data[ext[1]];
  for (let t = 1; t < T; t++) {
    const row = t * V;
    for (let s = 0; s < L; s++) {
      let v = a[s];
      if (s >= 1) v = lae(v, a[s - 1]);
      if (s >= 2 && ext[s] !== 0 && ext[s] !== ext[s - 2]) v = lae(v, a[s - 2]);
      b[s] = v + data[row + ext[s]];
    }
    const tmp = a; a = b; b = tmp;
  }
  return L > 1 ? lae(a[L - 1], a[L - 2]) : a[0];
}

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const IG = [['b', 'p'], ['d', 't'], ['g', 'k'], ['z', 'zh', 'j'], ['c', 'ch', 'q'], ['s', 'sh', 'x'], ['l', 'n', 'r'], ['f', 'h'], ['z', 'c', 's'], ['zh', 'ch', 'sh'], ['j', 'q', 'x']];
const FG = [['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang'], ['un', 'ong'], ['u', 'v'], ['ue', 've'], ['e', 'o', 'ou'], ['ai', 'ei'], ['ao', 'ou'], ['ie', 'ei'], ['iu', 'iou', 'you']];
function splitSyl(base: string): [string, string] {
  for (const i of INITIALS) if (base.startsWith(i)) return [i, base.slice(i.length)];
  return ['', base];
}
export function confusable(base: string): string[] {
  const [ini, fin] = splitSyl(base); const out = new Set<string>();
  for (const g of IG) if (g.includes(ini)) g.forEach(x => out.add(x + fin));
  for (const g of FG) if (g.includes(fin)) g.forEach(x => out.add(ini + x));
  out.delete(base); return [...out].sort();
}
/** Tones a syllable may legitimately be heard with, given tone sandhi (一, 不, 3-3). */
export function okTones(t: Target[], i: number): Set<number> {
  const s = new Set([t[i].tone]); const next = t[i + 1]?.tone;
  if (t[i].ch === '一' || t[i].ch === '不') [1, 2, 4].forEach(x => s.add(x));
  if (t[i].tone === 3 && next === 3) s.add(2);
  return s;
}

/** Per-syllable verdicts for the expected targets. */
export function verdicts(lex: Lexicon, lp: LogProbs, targets: Target[]): Verdict[] {
  const chars = targets.map(t => t.ch);
  const ys = encode(lex, chars);
  if (!ys) return targets.map(t => ({ ch: t.ch, mark: 'ok', tone: t.tone }));
  const base = ctcScore(lp, ys);
  return targets.map((t, i) => {
    const swap = (c: string) => { const e = encode(lex, [...chars.slice(0, i), c, ...chars.slice(i + 1)]); return e ? ctcScore(lp, e) : -Infinity; };
    let bestTone = -Infinity, toneHeard = 0, bestSound = -Infinity, soundHeard = '';
    if (t.tone !== 0) {
      const allowed = okTones(targets, i);
      for (const tn of [1, 2, 3, 4]) {
        if (allowed.has(tn)) continue;
        for (const c of lex.alts[t.base + tn] || []) if (c !== t.ch) { const sc = swap(c); if (sc > bestTone) { bestTone = sc; toneHeard = tn; } }
      }
    }
    for (const b of confusable(t.base)) for (const tn of [1, 2, 3, 4, 0]) {
      for (const c of lex.alts[b + tn] || []) if (c !== t.ch) { const sc = swap(c); if (sc > bestSound) { bestSound = sc; soundHeard = b + tn; } }
    }
    if (chars.length > 1) {
      const e = encode(lex, [...chars.slice(0, i), ...chars.slice(i + 1)]);
      const sc = e ? ctcScore(lp, e) : -Infinity; if (sc > bestSound) { bestSound = sc; soundHeard = ''; }
    }
    const soundOff = base - bestSound < SOUND_MARGIN, toneOff = base - bestTone < TONE_MARGIN;
    if (toneOff && (!soundOff || bestTone >= bestSound)) return { ch: t.ch, mark: 'tone', tone: t.tone, heard: t.base + toneHeard };
    if (soundOff) return { ch: t.ch, mark: 'no', tone: t.tone, heard: soundHeard || undefined };
    return { ch: t.ch, mark: 'ok', tone: t.tone };
  });
}

/** Viterbi CTC alignment: the output frame where each label is first emitted. */
export function ctcAlign(lp: LogProbs, ys: number[]): number[] {
  const { data, T, V } = lp; const L = 2 * ys.length + 1;
  const ext = new Int32Array(L); ys.forEach((y, i) => (ext[2 * i + 1] = y));
  const bp = new Uint8Array(T * L); // 0: stay, 1: from s-1, 2: from s-2
  let a = new Float64Array(L).fill(-Infinity), b = new Float64Array(L);
  a[0] = data[0]; if (L > 1) a[1] = data[ext[1]];
  for (let t = 1; t < T; t++) {
    const row = t * V;
    for (let s = 0; s < L; s++) {
      let v = a[s], k = 0;
      if (s >= 1 && a[s - 1] > v) { v = a[s - 1]; k = 1; }
      if (s >= 2 && ext[s] !== 0 && ext[s] !== ext[s - 2] && a[s - 2] > v) { v = a[s - 2]; k = 2; }
      b[s] = v + data[row + ext[s]]; bp[t * L + s] = k;
    }
    const tmp = a; a = b; b = tmp;
  }
  let s = L > 1 && a[L - 2] > a[L - 1] ? L - 2 : L - 1; const path = new Int32Array(T);
  for (let t = T - 1; t >= 0; t--) { path[t] = s; s -= bp[t * L + s]; }
  const first = new Array(ys.length).fill(-1);
  for (let t = 0; t < T; t++) if (path[t] % 2 === 1 && first[(path[t] - 1) / 2] < 0) first[(path[t] - 1) / 2] = t;
  return first;
}
