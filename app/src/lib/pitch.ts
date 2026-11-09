/** Pitch detection (YIN) and Mandarin tone classification. Pure math; the microphone plumbing lives in mic.ts. */
export interface PitchFrame { t: number; f: number; a: number }
export interface Contour { pts: { x: number; s: number }[]; medHz: number; dur: number }
export interface ToneResult { tone: 0 | 1 | 2 | 3 | 4; why: string }
export interface VoiceCal { mid: number; n: number }

export function yin(buf: Float32Array, sr: number): { f: number; conf: number } {
  const half = buf.length >> 1; const d = new Float32Array(half);
  const minTau = Math.floor(sr / 450), maxTau = Math.min(half - 2, Math.floor(sr / 65));
  for (let tau = 1; tau <= maxTau + 1; tau++) { let s = 0; for (let i = 0; i < half; i++) { const x = buf[i] - buf[i + tau]; s += x * x; } d[tau] = s; }
  let run = 0; d[0] = 1;
  for (let tau = 1; tau <= maxTau + 1; tau++) { run += d[tau]; d[tau] = run ? (d[tau] * tau) / run : 1; }
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (d[tau] < 0.18) {
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const den = a - 2 * b + c; const shift = den ? (a - c) / (2 * den) : 0;
      return { f: sr / (tau + shift), conf: 1 - b };
    }
  }
  return { f: 0, conf: 0 };
}
export const semitones = (f: number, ref: number) => 12 * Math.log2(f / ref);
export function median(a: number[]): number {
  if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
/** Clean a raw track into a contour in semitones around its own median (octave errors removed, smoothed, edges trimmed). */
export function contour(track: PitchFrame[]): Contour | null {
  if (track.length < 5) return null;
  const med = median(track.map(p => p.f));
  const pts = track.map(p => ({ t: p.t, s: semitones(p.f, med) })).filter(p => Math.abs(p.s) < 9);
  if (pts.length < 5) return null;
  const sm = pts.map((p, i) => ({ t: p.t, s: median(pts.slice(Math.max(0, i - 2), i + 3).map(q => q.s)) }));
  const cut = Math.floor(sm.length * 0.1);
  const core = sm.slice(cut, sm.length - cut || undefined);
  if (core.length < 4) return null;
  const tA = core[0].t, tB = core[core.length - 1].t || tA + 1;
  return { pts: core.map(p => ({ x: (p.t - tA) / Math.max(1, tB - tA), s: p.s })), medHz: med, dur: tB - tA };
}
export function classify(c: Contour | null, cal: VoiceCal): ToneResult {
  if (!c) return { tone: 0, why: 'I couldn’t hear a clear voice. Speak a little louder and hold the vowel.' };
  const p = c.pts;
  const seg = (a: number, b: number) => { const s = p.filter(q => q.x >= a && q.x <= b).map(q => q.s); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; };
  const start = seg(0, 0.2), end = seg(0.8, 1);
  let minI = 0, maxI = 0; p.forEach((q, i) => { if (q.s < p[minI].s) minI = i; if (q.s > p[maxI].s) maxI = i; });
  const minV = p[minI].s, maxV = p[maxI].s, minX = p[minI].x, range = maxV - minV;
  const calibrated = cal.n >= 3;
  const rel = calibrated ? semitones(c.medHz, cal.mid) : 0;
  const fallBefore = start - minV, riseAfter = end - minV;
  if (range < 1.8) return calibrated && rel < -2.5 ? { tone: 3, why: 'level and low' } : { tone: 1, why: 'level' };
  if (fallBefore >= 1.2 && riseAfter >= 1.2 && minX > 0.2 && minX < 0.85 && !(riseAfter > 2.2 * fallBefore && minX < 0.4)) return { tone: 3, why: 'dips then rises' };
  if (end - start >= 1.8) return { tone: 2, why: 'rising' };
  if (start - end >= 2.2) return calibrated && rel < -2 && range < 4.5 && start < 2 ? { tone: 3, why: 'low and falling slightly' } : { tone: 4, why: 'falling' };
  if (calibrated && rel < -2.5) return { tone: 3, why: 'low' };
  return { tone: 1, why: 'mostly level' };
}
/** Running estimate of the speaker's mid pitch, nudged by each confirmed tone. */
export function calibrate(cal: VoiceCal, medHz: number, tone: number): VoiceCal {
  let mid = medHz;
  if (tone === 1) mid = medHz * Math.pow(2, -2 / 12);
  if (tone === 3) mid = medHz * Math.pow(2, 2.5 / 12);
  const w = Math.min(cal.n, 12);
  return { mid: cal.n ? (cal.mid * w + mid) / (w + 1) : mid, n: cal.n + 1 };
}
export const TONE_DESC: Record<number, string> = { 1: 'high and level', 2: 'rising from mid to high', 3: 'low and dipping', 4: 'falling sharply from high to low' };
export const TARGET_SHAPES: Record<number, [number, number][]> = { 1: [[0, 5], [1, 5]], 2: [[0, 3], [1, 5]], 3: [[0, 2], [0.55, 1], [1, 4]], 4: [[0, 5], [1, 1]] };
