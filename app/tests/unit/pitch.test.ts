import { describe, it, expect } from 'vitest';
import { yin, contour, classify, calibrate, type PitchFrame, type VoiceCal } from '../../src/lib/pitch';

const shapes: Record<string, (x: number) => number> = {
  1: x => 250 + 3 * Math.sin(x * 6), 2: x => 180 + 90 * Math.pow(x, 1.4),
  3: x => (x < 0.55 ? 185 - 60 * (x / 0.55) : 125 + 70 * ((x - 0.55) / 0.45)), 4: x => 290 - 160 * x,
};
function track(f: (x: number) => number, n = 40, dur = 420): PitchFrame[] {
  return Array.from({ length: n }, (_, i) => { const x = i / (n - 1); let hz = f(x) * (1 + (Math.random() - 0.5) * 0.03); if (i % 23 === 7) hz *= 2; return { t: x * dur, f: hz, a: 0.1 }; });
}
describe('pitch detection', () => {
  it('finds the fundamental of a harmonic voice-like signal', () => {
    const sr = 24000, N = 1024;
    for (const f0 of [90, 140, 220, 330]) {
      const b = new Float32Array(N);
      for (let i = 0; i < N; i++) { const t = i / sr; b[i] = 0.5 * Math.sin(2 * Math.PI * f0 * t) + 0.3 * Math.sin(4 * Math.PI * f0 * t) + 0.15 * Math.sin(6 * Math.PI * f0 * t); }
      expect(Math.abs(yin(b, sr).f - f0)).toBeLessThan(1.5);
    }
  });
});
describe('tone classification', () => {
  it('classifies all four tones from noisy contours (with octave errors)', () => {
    let cal: VoiceCal = { mid: 0, n: 0 };
    for (const [tone, f] of Object.entries(shapes)) for (let k = 0; k < 25; k++) {
      const c = contour(track(f)); const r = classify(c, cal);
      expect(r.tone).toBe(Number(tone));
      cal = calibrate(cal, c!.medHz, r.tone);
    }
  });
  it('uses calibration to recognise a low level 3rd tone', () => {
    let cal: VoiceCal = { mid: 0, n: 0 };
    for (let i = 0; i < 5; i++) cal = calibrate(cal, 250, 1);
    expect(classify(contour(track(() => 150)), cal).tone).toBe(3);
  });
  it('reports silence clearly', () => { expect(classify(contour([]), { mid: 0, n: 0 }).tone).toBe(0); });
});
