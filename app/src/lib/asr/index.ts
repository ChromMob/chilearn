/** On-device speech checking: a bundled Mandarin speech model running in a Web Worker. Main-thread API. */
import type { Target, Verdict } from './ctc';
import type { SylPitch } from './tones';
export type { SylPitch } from './tones';
import type { SpeechScore, Mark } from '../speechScore';
export type { Target, Verdict } from './ctc';
export { targetsFor } from './targets';

export type AsrState = 'unsupported' | 'idle' | 'loading' | 'ready' | 'error';
export interface AsrProgress { loaded: number; total: number; stage?: string }
export interface AsrResult { heard: string; verdicts: Verdict[]; pitch?: SylPitch[]; ms: number }

/** Download size of the speech checker (model + runtime), for consent text. */
export const ASR_DOWNLOAD_MB = 75;
const CACHE_PREFIX = 'luxian-asr-';

// WebAssembly with SIMD (needed by the model runtime): Chrome 91+, Firefox 89+, Safari 16.4+
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function asrSupported(): boolean {
  try { return typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && WebAssembly.validate(SIMD) && typeof BigInt64Array !== 'undefined'; }
  catch { return false; }
}

let worker: Worker | null = null;
let state: AsrState = asrSupported() ? 'idle' : 'unsupported';
let error = '';
let progress: AsrProgress = { loaded: 0, total: 0 };
let loading: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
const pending = new Map<number, (r: any) => void>();
let nextId = 1;
const emit = () => listeners.forEach(f => f());

export const asrState = () => state;
export const asrError = () => error;
export const asrProgress = () => progress;
export function onAsrChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

function call(msg: object, timeoutMs = 120000): Promise<any> {
  return new Promise(resolve => {
    const id = nextId++;
    const t = setTimeout(() => { if (pending.delete(id)) resolve({ ok: false, error: 'timeout' }); }, timeoutMs);
    pending.set(id, r => { clearTimeout(t); resolve(r); });
    worker!.postMessage({ ...msg, id });
  });
}

/** Load the model (downloads once, then served from the device cache). Resolves true when ready. */
export function loadAsr(): Promise<boolean> {
  if (state === 'ready') return Promise.resolve(true);
  if (state === 'unsupported') return Promise.resolve(false);
  if (loading) return loading;
  state = 'loading'; error = ''; progress = { loaded: 0, total: 0 }; emit();
  loading = (async () => {
    try {
      if (!worker) {
        worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === 'progress') { progress = { loaded: m.loaded, total: m.total, stage: m.stage }; emit(); return; }
          const f = pending.get(m.id); if (f) { pending.delete(m.id); f(m); }
        };
        worker.onerror = ev => { error = ev.message || 'worker failed'; };
      }
      const r = await call({ type: 'load', base: document.baseURI }, 600000);
      if (!r.ok) throw new Error(r.error || 'load failed');
      state = 'ready';
    } catch (e: any) {
      state = 'error'; error = String(e?.message || e);
      worker?.terminate(); worker = null;
    }
    loading = null; emit();
    (window as any).__lxAsr = state;
    return state === 'ready';
  })();
  return loading;
}

/** True if the model files are already on this device (no download needed). */
export async function asrDownloaded(): Promise<boolean> {
  try {
    const k = (await caches.keys()).find(x => x.startsWith(CACHE_PREFIX));
    return !!k && (await (await caches.open(k)).keys()).length >= 5;
  } catch { return false; }
}

/** Score one recording against the expected syllables. */
export async function checkSpeech(pcm: Float32Array, sr: number, targets: Target[], ref?: { pcm: Float32Array; sr: number } | null): Promise<AsrResult> {
  if (!(await loadAsr())) throw new Error(error || 'speech checker unavailable');
  const r = await call({ type: 'check', pcm, sr, targets, ref: ref || undefined }, 30000);
  if (!r.ok) throw new Error(r.error);
  return { heard: r.heard, verdicts: r.verdicts, pitch: r.pitch, ms: r.ms };
}

/** Verdicts as the app's speech score (same pass rules as before). */
export function toScore(v: Verdict[], opts: { hardOnly?: boolean } = {}): SpeechScore {
  const marks = v.map(x => (opts.hardOnly && x.soft ? 'ok' : x.mark) as Mark);
  const credit = marks.reduce((a, m) => a + (m === 'ok' ? 1 : m === 'tone' ? 0.5 : 0), 0);
  return { score: v.length ? credit / v.length : 0, marks, chars: v.map(x => x.ch) };
}

// test hook (end-to-end tests drive the checker with known recordings)
if (typeof window !== 'undefined') (window as any).__lxAsrApi = { loadAsr, checkSpeech, asrState, asrProgress };
