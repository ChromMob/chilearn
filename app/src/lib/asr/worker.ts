/// <reference lib="webworker" />
/** Runs the speech model off the main thread: download (cached), features, inference, scoring. */
import * as ort from 'onnxruntime-web/wasm';
import { fbank, resampleTo16k } from './fbank';
import { ctcAlign, greedy, okTones, verdicts, type Lexicon, type LogProbs, type Target, type Verdict } from './ctc';
import { judgePitch, pitchTrack, syllableContours, type SylPitch } from './tones';

declare const self: DedicatedWorkerGlobalScope;
ort.env.logLevel = 'error'; // the runtime's startup notices (CPU vendor, graph rewrites) are not errors
let session: ort.InferenceSession | null = null;
let lex: Lexicon | null = null;
const CACHE = 'luxian-asr-';

async function fetchBytes(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  if (!r.body) { const b = new Uint8Array(await r.arrayBuffer()); onBytes(b.length); return b; }
  const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; onBytes(value.length); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
async function cachedBytes(cache: Cache | null, url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); onBytes(b.length); return b; }
  const b = await fetchBytes(url, onBytes);
  await cache?.put(url, new Response(b.slice().buffer)).catch(() => undefined);
  return b;
}

async function load(base: string) {
  if (session && lex) return;
  lex = await (await fetch(new URL('asr/lex.json', base).href)).json() as Lexicon;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE + lex.v);
    for (const k of await caches.keys()) if (k.startsWith(CACHE) && k !== CACHE + lex.v) await caches.delete(k);
  } catch { cache = null; }
  const total = lex.bytes; let loaded = 0; let last = 0;
  const tick = (n: number) => { loaded += n; const now = Date.now(); if (now - last > 120 || loaded >= total) { last = now; self.postMessage({ type: 'progress', loaded, total }); } };
  const parts = await Promise.all(lex.parts.map(p => cachedBytes(cache, new URL('asr/' + p, base).href, tick)));
  const model = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0;
  for (const p of parts) { model.set(p, o); o += p.length; }
  ort.env.wasm.numThreads = 1;
  self.postMessage({ type: 'progress', loaded: total, total, stage: 'starting' });
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  await infer(new Float32Array(8000)); // warm up so the first real check is quick
}

async function infer(x: Float32Array) {
  const { data, frames } = fbank(x);
  if (frames < 10) return { data: new Float32Array(0), T: 0, V: 0 };
  const out = await session!.run({ x: new ort.Tensor('float32', data, [1, frames, 80]), x_lens: new ort.Tensor('int64', BigInt64Array.from([BigInt(frames)]), [1]) });
  const lp = out.log_probs as ort.Tensor; const T = Number((out.log_probs_len as ort.Tensor).data[0]); const V = lp.dims[2];
  return { data: (lp.data as Float32Array).subarray(0, T * V), T, V };
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data; const reply = (r: object) => self.postMessage({ id: m.id, ...r });
  try {
    if (m.type === 'load') { await load(m.base); reply({ ok: true }); }
    else if (m.type === 'check') {
      if (!session || !lex) throw new Error('not loaded');
      const t0 = performance.now();
      const targets = m.targets as Target[];
      const x = resampleTo16k(m.pcm as Float32Array, m.sr);
      const lp = await infer(x);
      const heard = lp.T ? greedy(lex, lp) : '';
      let v: Verdict[] = lp.T ? verdicts(lex, lp, targets) : targets.map(t => ({ ch: t.ch, mark: 'no' as const, tone: t.tone }));
      // tone hint from pitch: compare each syllable's contour with the course recording and textbook shapes
      let pitch: SylPitch[] | undefined;
      const ids = targets.map(t => lex!.chars[t.ch]);
      if (lp.T && ids.every(Boolean)) {
        const contours = async (a: Float32Array, l: LogProbs) => {
          const first = ctcAlign(l, ids.flat()); let k = 0;
          const starts = ids.map(i => { const f = first[k]; k += i.length; return (Math.max(0, f) * a.length) / 16000 / l.T; });
          return syllableContours(pitchTrack(a), starts);
        };
        const lc = await contours(x, lp);
        let rc: Array<number[] | null> = targets.map(() => null);
        if (m.ref) { const r = resampleTo16k(m.ref.pcm as Float32Array, m.ref.sr); const rl = await infer(r); if (rl.T) rc = await contours(r, rl); }
        pitch = targets.map((t, i) => judgePitch(lc[i], rc[i], t.tone, t.ch === '一' || t.ch === '不' ? new Set([1, 2, 3, 4]) : okTones(targets, i)));
        v = v.map((x2, i) => (x2.mark === 'ok' && pitch![i].flag ? { ...x2, mark: 'tone' as const, soft: true, heard: targets[i].base + pitch![i].tone } : x2));
      }
      reply({ ok: true, heard, verdicts: v, pitch, ms: Math.round(performance.now() - t0) });
    }
  } catch (err: any) { reply({ ok: false, error: String(err?.message || err) }); }
};
