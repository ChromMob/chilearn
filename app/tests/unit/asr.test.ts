/** On-device speech checker: TypeScript matches the Python reference (features, CTC scores, transcript) and flags errors. */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fbank, resampleTo16k } from '../../src/lib/asr/fbank';
import { ctcAlign, ctcScore, encode, greedy, verdicts, confusable, type Lexicon, type LogProbs } from '../../src/lib/asr/ctc';
import { judgePitch, pitchTrack, syllableContours } from '../../src/lib/asr/tones';
import { targetsFor } from '../../src/lib/asr/targets';

const FX = join(__dirname, '../fixtures/asr');
const LEX = join(__dirname, '../../public/asr/lex.json');
const have = existsSync(LEX) && existsSync(join(FX, 'cases.json'));
const f32 = (p: string) => { const b = readFileSync(p); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

describe.skipIf(!have)('on-device speech checker', () => {
  const lex: Lexicon = have ? JSON.parse(readFileSync(LEX, 'utf8')) : null as any;
  const cases: any[] = have ? JSON.parse(readFileSync(join(FX, 'cases.json'), 'utf8')) : [];
  const lpOf = (k: number): LogProbs => { const data = f32(join(FX, `${k}.lp.bin`)); return { data, T: cases[k].T, V: data.length / cases[k].T }; };

  it('computes the same filterbank features as kaldi-native-fbank', () => {
    cases.forEach((c, k) => {
      const { data, frames } = fbank(f32(join(FX, `${k}.pcm.bin`)));
      const ref = f32(join(FX, `${k}.fbank.bin`));
      expect(frames).toBe(c.frames);
      let worst = 0; for (let i = 0; i < ref.length; i++) worst = Math.max(worst, Math.abs(ref[i] - data[i]) / Math.max(1, Math.abs(ref[i])));
      expect(worst).toBeLessThan(1e-3);
    });
  });
  it('tokenizes and scores label sequences like the reference', () => {
    cases.forEach((c, k) => {
      const lp = lpOf(k);
      for (const [text, [ids, score]] of Object.entries<any>(c.scores)) {
        expect(encode(lex, [...text])).toEqual(ids);
        expect(ctcScore(lp, ids)).toBeCloseTo(score, 2);
      }
      expect(greedy(lex, lp)).toBe(c.greedy);
    });
  });
  it('passes correct speech and flags a wrong tone and a wrong syllable', () => {
    const py: Record<string, string> = { 想想: 'xiǎng xiǎng', 报名: 'bào míng' };
    cases.forEach((c, k) => {
      const v = verdicts(lex, lpOf(k), targetsFor(c.target, py[c.target]));
      if (c.label === 'ok') expect(v.map(x => x.mark)).toEqual(v.map(() => 'ok'));
      else expect(v[c.pos].mark).toBe(c.label);
    });
  });
  it('knows tone sandhi and similar sounds', () => {
    expect(targetsFor('你好', 'nǐ hǎo')).toEqual([{ ch: '你', base: 'ni', tone: 3 }, { ch: '好', base: 'hao', tone: 3 }]);
    expect(targetsFor('绿色', 'lǜ sè')[0].base).toBe('lv');
    expect(confusable('zhi')).toContain('zi');
    expect(confusable('fan')).toContain('fang');
  });
  it('resamples 48 kHz to 16 kHz without changing pitch', () => {
    const x = new Float32Array(48000); for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
    const y = resampleTo16k(x, 48000); expect(y.length).toBe(16000);
    let zc = 0; for (let i = 1; i < y.length; i++) if (y[i - 1] < 0 && y[i] >= 0) zc++;
    expect(Math.abs(zc - 440)).toBeLessThanOrEqual(2);
  });
  it('aligns each expected character to the audio in order', () => {
    cases.forEach((c, k) => {
      const lp = lpOf(k); const ids = encode(lex, [...c.target])!; const first = ctcAlign(lp, ids);
      expect(first.every(f => f >= 0 && f < lp.T)).toBe(true);
      expect(first.every((f, i) => i === 0 || f > first[i - 1])).toBe(true);
    });
  });
});

describe('pitch tone hint', () => {
  const sweep = (f0: number, f1: number, dur: number) => { const n = Math.round(16000 * dur), x = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const f = f0 + ((f1 - f0) * i) / n; ph += (2 * Math.PI * f) / 16000; x[i] = 0.3 * Math.sin(ph) + 0.15 * Math.sin(2 * ph); } return x; };
  it('tracks a rising then falling voice as two syllables', () => {
    const gap = new Float32Array(1600);
    const x = new Float32Array([...sweep(180, 260, 0.35), ...gap, ...sweep(280, 170, 0.35)]);
    const c = syllableContours(pitchTrack(x), [0, 0.4]);
    expect(c[0]![9] - c[0]![0]).toBeGreaterThan(3);   // rises
    expect(c[1]![0] - c[1]![9]).toBeGreaterThan(3);   // falls
  });
  it('flags a falling syllable that should rise, but not one matching the course voice or its own tone', () => {
    const fall = [4, 3, 2, 1, 0, -1, -2, -2.5, -3, -3.5], rise = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
    expect(judgePitch(fall, rise, 2, new Set([2])).flag).toBe(true);
    expect(judgePitch(fall, rise, 2, new Set([2])).tone).toBe(4);
    expect(judgePitch(rise, rise, 2, new Set([2])).flag).toBe(false);
    expect(judgePitch(fall, fall, 2, new Set([2])).flag).toBe(false);   // matches the course recording (e.g. sandhi)
    expect(judgePitch(fall, null, 4, new Set([4])).flag).toBe(false);
    expect(judgePitch(fall, null, 0, new Set([0])).flag).toBe(false);   // neutral tone: not judged
  });
});
