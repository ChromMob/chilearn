/**
 * Pitch-based tone check for words and sentences. The speech model mostly hears *which word* was said, so a wrong tone
 * on an obvious word can slip through; here each syllable's pitch contour is compared with the course recording of
 * the same text and with textbook tone shapes. Used as a soft hint (shown, but never fails an answer on its own).
 */
import { yin, median } from '../pitch';

export interface SylPitch { l: number[] | null; r: number[] | null; flag: boolean; tone?: number }
const SR = 16000, WIN = 672, HOP = 160, PTS = 10;
const TPL: Record<number, number[]> = { 1: [2, 2], 2: [-1.5, 3], 3: [-2, -5, -4], 4: [4, -3.5] };
export const PITCH_MARGIN = 1.0;

const interp = (xs: number[], ys: number[], x: number) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const u = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + u * (ys[i] - ys[i - 1]); }
  return ys[ys.length - 1];
};
const template = (t: number) => Array.from({ length: PTS }, (_, i) => interp(TPL[t].map((_, k) => k / (TPL[t].length - 1)), TPL[t], i / (PTS - 1)));
const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

/** Voiced pitch frames (time s, Hz) of 16 kHz audio. */
export function pitchTrack(x: Float32Array): Array<[number, number]> {
  const out: Array<[number, number]> = []; const rms: number[] = [];
  for (let i = 0; i + WIN <= x.length; i += HOP) { let r = 0; for (let k = 0; k < WIN; k++) r += x[i + k] * x[i + k]; rms.push(Math.sqrt(r / WIN)); }
  const gate = Math.max(0.004, 0.12 * Math.max(0, ...rms));
  for (let j = 0, i = 0; i + WIN <= x.length; i += HOP, j++) {
    if (rms[j] < gate) continue;
    const { f, conf } = yin(x.subarray(i, i + WIN), SR);
    if (f && conf > 0.75) out.push([i / SR, f]);
  }
  return out;
}

/** One 10-point contour per syllable (semitones around the utterance's median), split at the aligned syllable starts. */
export function syllableContours(track: Array<[number, number]>, starts: number[]): Array<number[] | null> {
  if (track.length < 8) return starts.map(() => null);
  const ts = track.map(p => p[0]); const med = median(track.map(p => p[1]));
  const st = track.map(p => 12 * Math.log2(p[1] / med));
  const bounds = starts.slice(1).map(s => {
    let best = s, bd = 0.12;
    for (let i = 0; i + 1 < ts.length; i++) if (ts[i + 1] - ts[i] > 0.025) { const c = (ts[i] + ts[i + 1]) / 2; if (Math.abs(c - s) < bd) { bd = Math.abs(c - s); best = c; } }
    return best;
  });
  const edges = [-1, ...bounds, 1e9];
  return starts.map((_, i) => {
    const idx = ts.map((t, k) => (t >= edges[i] && t < edges[i + 1] ? k : -1)).filter(k => k >= 0 && Math.abs(st[k]) < 9);
    if (idx.length < 5) return null;
    const cut = Math.max(1, Math.floor(idx.length / 10)); const core = idx.slice(cut, idx.length - cut);
    const t = core.map(k => ts[k]); const v = core.map((k, j) => median(core.slice(Math.max(0, j - 2), j + 3).map(q => st[q])));
    return Array.from({ length: PTS }, (_, i2) => interp(t, v, t[0] + ((t[t.length - 1] - t[0]) * i2) / (PTS - 1)));
  });
}

/** Flag a syllable whose contour is closer to a wrong tone's shape than to both the course voice and its own tone. */
export function judgePitch(l: number[] | null, r: number[] | null, tone: number, allowed: Set<number>): SylPitch {
  if (!l || tone < 1 || tone > 4) return { l, r, flag: false };
  const good = Math.min(r ? dist(l, r) : Infinity, ...[...allowed].filter(t => TPL[t]).map(t => dist(l, template(t))));
  let bad = Infinity, heard = 0;
  for (const t of [1, 2, 3, 4]) if (!allowed.has(t)) { const d = dist(l, template(t)); if (d < bad) { bad = d; heard = t; } }
  return good - bad > PITCH_MARGIN ? { l, r, flag: true, tone: heard } : { l, r, flag: false };
}
