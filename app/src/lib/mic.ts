/** Microphone access, live level metering, pitch recording, and speech recognition with clear error states. */
import { yin, type PitchFrame } from './pitch';
import { actx } from './audio';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export type MicState = 'unknown' | 'granted' | 'denied' | 'blocked' | 'unsupported' | 'nodevice';
export type RecError = 'unsupported' | 'not-allowed' | 'service-not-allowed' | 'network' | 'no-speech' | 'audio-capture' | 'aborted' | 'language-not-supported' | 'start-failed' | 'timeout';

function policyAllowsMic(): boolean {
  try {
    const fp = (document as any).permissionsPolicy || (document as any).featurePolicy;
    if (fp && typeof fp.allowsFeature === 'function') return fp.allowsFeature('microphone');
  } catch { /* ignore */ }
  return true;
}
const runtime = { micState: 'unknown' as MicState, recognitionWorks: null as null | boolean, recError: null as null | RecError };

export function micSupport(): MicState {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  if (!policyAllowsMic()) return 'blocked';
  return runtime.micState;
}
export const recognitionSupported = () => !!SR && micSupport() !== 'blocked' && micSupport() !== 'unsupported';
export const recognitionState = () => ({ works: runtime.recognitionWorks, error: runtime.recError });
export function setRecognitionVerified(ok: boolean) { runtime.recognitionWorks = ok; }

let stream: MediaStream | null = null;
export async function getMic(): Promise<MediaStream> {
  if (stream && stream.active) return stream;
  if (micSupport() === 'unsupported') throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
  if (micSupport() === 'blocked') throw Object.assign(new Error('blocked'), { code: 'blocked' });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    runtime.micState = 'granted';
    return stream;
  } catch (e: any) {
    const name = e?.name;
    runtime.micState = name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nodevice' : name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : runtime.micState;
    throw Object.assign(new Error(name || 'mic-failed'), { code: runtime.micState });
  }
}
export function releaseMic() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

/** Live input level (0..1) until stop() is called. */
export async function meter(onLevel: (lvl: number) => void): Promise<() => void> {
  const s = await getMic(); const c = actx(); if (!c) throw new Error('no-audio');
  const src = c.createMediaStreamSource(s); const an = c.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Float32Array(an.fftSize); let raf = 0, live = true;
  const step = () => { if (!live) return; an.getFloatTimeDomainData(buf); let r = 0; for (const v of buf) r += v * v; onLevel(Math.min(1, Math.sqrt(r / buf.length) * 10)); raf = requestAnimationFrame(step); };
  step();
  return () => { live = false; cancelAnimationFrame(raf); try { src.disconnect(); } catch { /* ignore */ } };
}

/** Record one utterance's pitch track. Stops after ~0.45 s of silence following voice, or maxMs. */
export async function recordPitch(opts: { onFrame?: (f: { level: number; f: number }) => void; maxMs?: number; signal?: { aborted: boolean } } = {}): Promise<PitchFrame[]> {
  const maxMs = opts.maxMs ?? 3500;
  const s = await getMic(); const c = actx(); if (!c) throw new Error('no-audio');
  const src = c.createMediaStreamSource(s); const an = c.createAnalyser(); an.fftSize = 2048; src.connect(an);
  const raw = new Float32Array(an.fftSize); const sr = c.sampleRate; const ds = sr > 30000 ? 2 : 1;
  const buf = new Float32Array(Math.floor(raw.length / ds));
  const track: PitchFrame[] = [];
  let noise = 0.004, voiced = false, lastVoice = 0, frames = 0; const t0 = performance.now();
  return new Promise(resolve => {
    const finish = () => { try { src.disconnect(); } catch { /* ignore */ } resolve(track); };
    const step = () => {
      if (opts.signal?.aborted) return finish();
      const t = performance.now() - t0;
      an.getFloatTimeDomainData(raw);
      for (let i = 0; i < buf.length; i++) buf[i] = raw[i * ds];
      let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]; rms = Math.sqrt(rms / buf.length);
      frames++;
      if (frames < 8 && !voiced) noise = Math.min(0.015, Math.max(0.002, noise * 0.7 + rms * 0.3));
      let f = 0;
      if (rms > Math.max(0.012, noise * 3)) {
        const r = yin(buf, sr / ds);
        if (r.f && r.conf > 0.75) { f = r.f; track.push({ t, f, a: rms }); }
        voiced = true; lastVoice = t;
      }
      opts.onFrame?.({ level: Math.min(1, rms * 12), f });
      if ((voiced && t - lastVoice > 450) || t > maxMs || (!voiced && t > 4000)) return finish();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export interface Utterance { pcm: Float32Array; sr: number; voiced: boolean; ms: number }
/**
 * Record one spoken utterance as raw samples. Waits for a moment of quiet before listening (so speech already in
 * progress, or the course audio's tail, isn't cut in half), starts at the voice onset (with a little lead-in), and
 * stops after `silenceMs` of quiet or `maxMs`.
 */
export async function recordUtterance(opts: { onLevel?: (lvl: number) => void; maxMs?: number; silenceMs?: number; signal?: { aborted: boolean } } = {}): Promise<Utterance> {
  const maxMs = opts.maxMs ?? 12000, silenceMs = opts.silenceMs ?? 800;
  const s = await getMic(); const c = actx(); if (!c) throw new Error('no-audio');
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  const sr = c.sampleRate; const src = c.createMediaStreamSource(s);
  const proc = c.createScriptProcessor(2048, 1, 1); const sink = c.createGain(); sink.gain.value = 0;
  src.connect(proc); proc.connect(sink); sink.connect(c.destination);
  const chunks: Float32Array[] = []; const chunkMs = (2048 / sr) * 1000;
  let noise = 0.006, quietMs = 0, armed = false, loud = 0, start = -1, lastVoice = -1, done = false;
  return new Promise(resolve => {
    const finish = (voiced: boolean) => {
      if (done) return; done = true;
      try { proc.disconnect(); src.disconnect(); sink.disconnect(); } catch { /* ignore */ }
      const lead = Math.ceil(300 / chunkMs), tail = Math.ceil(250 / chunkMs);
      const a = voiced ? Math.max(0, start - lead) : 0, b = voiced ? Math.min(chunks.length, lastVoice + 1 + tail) : 0;
      const n = chunks.slice(a, b).reduce((x, ch) => x + ch.length, 0); const pcm = new Float32Array(n); let o = 0;
      for (const ch of chunks.slice(a, b)) { pcm.set(ch, o); o += ch.length; }
      resolve({ pcm, sr, voiced, ms: Math.round((n / sr) * 1000) });
    };
    proc.onaudioprocess = ev => {
      if (done) return;
      if (opts.signal?.aborted) return finish(false);
      const x = new Float32Array(ev.inputBuffer.getChannelData(0)); chunks.push(x);
      let r = 0; for (let i = 0; i < x.length; i++) r += x[i] * x[i]; r = Math.sqrt(r / x.length);
      const k = chunks.length - 1, t = k * chunkMs;
      opts.onLevel?.(Math.min(1, r * 12));
      const thr = Math.max(0.01, noise * 3.5);
      if (r < thr) {
        if (start < 0) noise = noise * 0.8 + r * 0.2;
        quietMs += chunkMs; loud = 0;
        if (quietMs >= 150) armed = true;
        if (start >= 0 && t - lastVoice * chunkMs > silenceMs) return finish(true);
      } else {
        quietMs = 0;
        if (armed) { loud++; if (start < 0 && loud >= 2) start = k - 1; if (start >= 0) lastVoice = k; }
      }
      if (t > maxMs) return finish(start >= 0);
      if (start < 0 && t > 7000) return finish(false);
    };
  });
}

let activeRec: any = null;
export interface RecResult { alternatives: string[]; error: RecError | null }
/** Listen once in Mandarin. onInterim streams partial text. */
export function recognize(opts: { onInterim?: (t: string) => void; maxMs?: number } = {}): Promise<RecResult> {
  return new Promise(resolve => {
    if (!recognitionSupported()) return resolve({ alternatives: [], error: 'unsupported' });
    try { activeRec?.abort(); } catch { /* ignore */ }
    let r: any;
    try { r = new SR(); } catch { return resolve({ alternatives: [], error: 'unsupported' }); }
    r.lang = 'zh-CN'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
    let finals: string[] = [], interim = '', err: RecError | null = null, settled = false;
    const finish = () => {
      if (settled) return; settled = true; clearTimeout(timer);
      const alts = finals.length ? finals : interim ? [interim] : [];
      const error = alts.length ? null : err || 'no-speech';
      if (alts.length) { runtime.recognitionWorks = true; runtime.recError = null; }
      else if (error && !['no-speech', 'aborted'].includes(error)) { runtime.recError = error; if (['not-allowed', 'service-not-allowed', 'network', 'language-not-supported'].includes(error)) runtime.recognitionWorks = false; }
      if (activeRec === r) activeRec = null;
      resolve({ alternatives: alts, error });
    };
    r.onresult = (ev: any) => {
      interim = '';
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        const res = ev.results[k];
        if (res.isFinal) { finals = []; for (let a = 0; a < res.length; a++) finals.push(res[a].transcript); }
        else interim += res[0].transcript;
      }
      opts.onInterim?.(finals[0] || interim);
    };
    r.onerror = (ev: any) => { err = ev.error as RecError; if (ev.error === 'not-allowed') runtime.micState = 'denied'; };
    r.onend = finish;
    const timer = setTimeout(() => { try { r.stop(); } catch { /* ignore */ } setTimeout(() => { err = err || 'timeout'; finish(); }, 1200); }, opts.maxMs ?? 8000);
    activeRec = r;
    try { r.start(); } catch { err = 'start-failed'; finish(); }
  });
}
export function stopRecognition() { try { activeRec?.stop(); } catch { /* ignore */ } }
export function abortRecognition() { try { activeRec?.abort(); } catch { /* ignore */ } activeRec = null; }
export const REC_ERROR_TEXT: Record<RecError, string> = {
  unsupported: 'This browser can’t transcribe speech.',
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': 'The browser’s speech service is turned off or not allowed.',
  network: 'The speech service couldn’t be reached.',
  'no-speech': 'No speech was heard.',
  'audio-capture': 'No microphone was found.',
  aborted: 'Listening was stopped.',
  'language-not-supported': 'Mandarin recognition isn’t available in this browser.',
  'start-failed': 'Speech recognition couldn’t start.',
  timeout: 'Listening timed out.',
};

/** A playable WAV object URL for recorded samples (so learners can hear themselves). */
export function wavUrl(pcm: Float32Array, sr: number): string {
  const n = pcm.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.round(pcm[i] * 32767))), true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
