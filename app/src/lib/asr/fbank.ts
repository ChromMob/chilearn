/**
 * Kaldi-compatible log-mel filterbank (80 bins, 25 ms / 10 ms, povey window, no dither, snip_edges=false),
 * matching kaldi-native-fbank as used to train the speech model. Input: 16 kHz mono samples in [-1, 1].
 */
const SR = 16000, SHIFT = 160, LEN = 400, NFFT = 512, BINS = 80, LOW = 20, HIGH = SR / 2 - 400, PREEMPH = 0.97;
const EPS = 1.1920928955078125e-7;

const WINDOW = new Float64Array(LEN);
for (let i = 0; i < LEN; i++) WINDOW[i] = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (LEN - 1)), 0.85);

const mel = (f: number) => 1127 * Math.log(1 + f / 700);
/** Mel filters as [first FFT bin, weights] like Kaldi's MelBanks. */
const FILTERS: Array<[number, Float64Array]> = (() => {
  const nb = NFFT / 2, width = SR / NFFT, lo = mel(LOW), hi = mel(HIGH), d = (hi - lo) / (BINS + 1);
  const out: Array<[number, Float64Array]> = [];
  for (let b = 0; b < BINS; b++) {
    const l = lo + b * d, c = lo + (b + 1) * d, r = lo + (b + 2) * d;
    let first = -1, last = -1; const w = new Float64Array(nb);
    for (let i = 0; i < nb; i++) {
      const m = mel(width * i);
      if (m > l && m < r) { w[i] = m <= c ? (m - l) / (c - l) : (r - m) / (r - c); if (first < 0) first = i; last = i; }
    }
    out.push([first, w.slice(first, last + 1)]);
  }
  return out;
})();

// radix-2 complex FFT tables for NFFT
const LOG2 = Math.log2(NFFT);
const REV = new Uint16Array(NFFT);
for (let i = 0; i < NFFT; i++) { let r = 0; for (let b = 0; b < LOG2; b++) r |= ((i >> b) & 1) << (LOG2 - 1 - b); REV[i] = r; }
const COS = new Float64Array(NFFT / 2), SIN = new Float64Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / NFFT); SIN[i] = -Math.sin((2 * Math.PI * i) / NFFT); }
function fft(re: Float64Array, im: Float64Array) {
  for (let i = 0; i < NFFT; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1, step = NFFT / size;
    for (let s = 0; s < NFFT; s += size) for (let k = 0; k < half; k++) {
      const a = s + k, b = a + half, c = COS[k * step], sn = SIN[k * step];
      const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}

/** Returns frames × 80 features (row-major) and the frame count. */
export function fbank(x: Float32Array): { data: Float32Array; frames: number } {
  const n = x.length, frames = n > 0 ? Math.floor((n + SHIFT / 2) / SHIFT) : 0;
  const data = new Float32Array(frames * BINS);
  const w = new Float64Array(LEN), re = new Float64Array(NFFT), im = new Float64Array(NFFT), pow = new Float64Array(NFFT / 2 + 1);
  for (let f = 0; f < frames; f++) {
    const start = f * SHIFT + SHIFT / 2 - LEN / 2;
    let mean = 0;
    for (let s = 0; s < LEN; s++) {
      let k = s + start;
      while (k < 0 || k >= n) k = k < 0 ? -k - 1 : 2 * n - 1 - k;
      w[s] = x[k]; mean += w[s];
    }
    mean /= LEN;
    for (let s = 0; s < LEN; s++) w[s] -= mean;
    for (let s = LEN - 1; s > 0; s--) w[s] -= PREEMPH * w[s - 1];
    w[0] -= PREEMPH * w[0];
    re.fill(0); im.fill(0);
    for (let s = 0; s < LEN; s++) re[s] = w[s] * WINDOW[s];
    fft(re, im);
    for (let k = 0; k <= NFFT / 2; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
    for (let b = 0; b < BINS; b++) {
      const [first, ws] = FILTERS[b]; let e = 0;
      for (let i = 0; i < ws.length; i++) e += ws[i] * pow[first + i];
      data[f * BINS + b] = Math.log(Math.max(e, EPS));
    }
  }
  return { data, frames };
}

/** Windowed-sinc resampler to 16 kHz (anti-aliased). */
export function resampleTo16k(x: Float32Array, sr: number): Float32Array {
  if (sr === SR) return x;
  const ratio = sr / SR, outLen = Math.floor(x.length / ratio), out = new Float32Array(outLen);
  const cutoff = Math.min(1, 1 / ratio) * 0.95, half = 16;
  for (let i = 0; i < outLen; i++) {
    const t = i * ratio, c = Math.floor(t); let acc = 0, norm = 0;
    for (let k = c - half * Math.ceil(ratio) + 1; k <= c + half * Math.ceil(ratio); k++) {
      if (k < 0 || k >= x.length) continue;
      const d = (t - k) * cutoff, win = 0.5 + 0.5 * Math.cos((Math.PI * (t - k)) / (half * Math.ceil(ratio) + 1));
      const s = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      const wgt = s * win; acc += x[k] * wgt; norm += wgt;
    }
    out[i] = norm ? acc / norm : 0;
  }
  return out;
}
