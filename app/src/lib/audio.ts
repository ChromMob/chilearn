/** Mandarin text-to-speech through the browser's voices, plus feedback chimes and haptics. */
import { sleep } from './util';

type Listener = () => void;
const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voices: SpeechSynthesisVoice[] = [];
let chosen: SpeechSynthesisVoice | null = null;
let preferredURI = '';
let rate = 0.85;
let soundOn = true;
const listeners = new Set<Listener>();

function score(v: SpeechSynthesisVoice) {
  const n = (v.name + ' ' + v.voiceURI).toLowerCase(); let s = 0;
  if (/natural|neural|online|premium|enhanced/.test(n)) s += 5;
  if (/google/.test(n)) s += 3;
  if (/xiaoxiao|yunxi|xiaoyi|tingting|lili|yaoyao|huihui|kangkang|meijia|yu-shu/.test(n)) s += 2;
  if (v.localService) s += 1;
  return s;
}
const isMandarin = (v: SpeechSynthesisVoice) => /^(zh[-_]cn|cmn|zh[-_]hans|zh)$/i.test(v.lang.replace(/-hans-cn$/i, '-cn')) || /^zh[-_]CN/i.test(v.lang) || /^cmn/i.test(v.lang);

function load() {
  if (!synth) return;
  const all = synth.getVoices() || [];
  let zh = all.filter(isMandarin);
  if (!zh.length) zh = all.filter(v => /^zh/i.test(v.lang) && !/hk|yue|tw/i.test(v.lang));
  voices = zh.sort((a, b) => score(b) - score(a));
  chosen = voices.find(v => v.voiceURI === preferredURI) || voices[0] || null;
  listeners.forEach(f => f());
}
if (synth) { load(); synth.addEventListener?.('voiceschanged', load); [300, 1000, 2500, 5000].forEach(ms => setTimeout(load, ms)); }

let unlocked = false;
/** iOS needs the first utterance inside a user gesture; call from the first tap. */
export function unlockAudio() {
  if (unlocked) return; unlocked = true;
  try { if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } } catch { /* ignore */ }
  try { actx(); } catch { /* ignore */ }
  try { (navigator as any).audioSession && ((navigator as any).audioSession.type = 'playback'); } catch { /* ignore */ }
  try { el = el || new Audio(); } catch { /* ignore */ }
}

let seq = 0;

// ---------- course audio: pre-generated, verified neural voice (see build/audio) ----------
type Clip = [number, number, number, number, number?]; // file index, byte start, byte length, verified, playback volume
interface AudioIndex { files: string[]; clips: Record<string, Clip> }
const indexes = new Map<string, AudioIndex>();
const loadingIdx = new Map<string, Promise<void>>();
const packs = new Map<string, Promise<ArrayBuffer>>();
const decoded = new Map<string, AudioBuffer>();
let source: 'course' | 'device' = 'course';
let current: { stop: () => void } | null = null;
let el: HTMLAudioElement | null = null;
let useWebAudio = false;

async function getJson<T>(url: string): Promise<T> {
  let last: unknown;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } catch (e) { last = e; await sleep(400 * 2 ** a); }
  }
  throw last;
}
/** Load the clip index for a level ('shared', '1'…'6', 'adv'). Safe to call repeatedly. */
const failedIdx = new Map<string, number>();
export function loadAudioIndex(level: string): Promise<void> {
  if (indexes.has(level)) return Promise.resolve();
  // after a failed load (offline, or a level without bundled audio) don't make every lesson wait for retries again
  if (Date.now() - (failedIdx.get(level) || 0) < 60000) return Promise.resolve();
  if (!loadingIdx.has(level)) loadingIdx.set(level, getJson<AudioIndex>(`./audio/index-${level}.json`).then(ix => { indexes.set(level, ix); listeners.forEach(f => f()); }).catch(() => { loadingIdx.delete(level); failedIdx.set(level, Date.now()); }));
  return loadingIdx.get(level)!;
}
function findClip(text: string, voice?: 'f' | 'm'): { ix: AudioIndex; clip: Clip; key: string } | null {
  const t = text.trim();
  const keys = voice === 'm' ? [t + '|m', t] : [t, t + '|m'];
  for (const key of keys) for (const ix of indexes.values()) { const clip = ix.clips[key]; if (clip) return { ix, clip, key }; }
  return null;
}
export const hasCourseClip = (text: string) => !!findClip(text);
function packBytes(file: string): Promise<ArrayBuffer> {
  if (!packs.has(file)) packs.set(file, fetch('./audio/' + file).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).catch(e => { packs.delete(file); throw e; }));
  return packs.get(file)!;
}
/** Decoded samples of the verified course recording of `text` (for comparing a learner's pitch), or null. */
export async function courseClipPcm(text: string, voice?: 'f' | 'm'): Promise<{ pcm: Float32Array; sr: number } | null> {
  try {
    const f = findClip(text, voice); const c = actx();
    if (!f || !f.clip[3] || !c) return null;
    const all = await packBytes(f.ix.files[f.clip[0]]);
    const buf = await c.decodeAudioData(all.slice(f.clip[1], f.clip[1] + f.clip[2]));
    return { pcm: buf.getChannelData(0).slice(), sr: buf.sampleRate };
  } catch { return null; }
}
/** Start downloading a unit's audio before it is needed. */
export function prefetchAudio(packId: string) {
  for (const ix of indexes.values()) if (ix.files.includes(packId + '.mp3')) { packBytes(packId + '.mp3').catch(() => {}); return; }
}
function playbackRate(slow?: boolean) { return slow ? 0.7 : rate >= 1 ? 1 : rate >= 0.85 ? 0.95 : 0.8; }

/** Pitch-preserving time stretch (WSOLA) for the Web Audio fallback path. */
function stretch(ctx: AudioContext, buf: AudioBuffer, r: number): AudioBuffer {
  const x = buf.getChannelData(0), sr = buf.sampleRate;
  const N = Math.round(sr * 0.03), Hs = N >> 1, Ha = Hs * r, tol = Math.round(sr * 0.008);
  const outLen = Math.ceil(x.length / r) + N; const y = new Float32Array(outLen); const wsum = new Float32Array(outLen);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  let prev = 0;
  for (let k = 0, out = 0; out + N < outLen; k++, out += Hs) {
    const target = Math.round(k * Ha); if (target + N + tol >= x.length) break;
    let best = target, bestC = -Infinity;
    if (k > 0) for (let d = -tol; d <= tol; d++) {
      const p = target + d; if (p < 0) continue; let c = 0;
      for (let i = 0; i < N; i += 4) c += x[p + i] * x[prev + Hs + i];
      if (c > bestC) { bestC = c; best = p; }
    }
    for (let i = 0; i < N; i++) { y[out + i] += x[best + i] * win[i]; wsum[out + i] += win[i]; }
    prev = best;
  }
  for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-3) y[i] /= wsum[i];
  const ob = ctx.createBuffer(1, outLen, sr); ob.copyToChannel(y, 0); return ob;
}
async function playWebAudio(bytes: ArrayBuffer, key: string, r: number, my: number, vol = 1): Promise<boolean> {
  const c = actx(); if (!c) return false;
  const k = key + '@' + r;
  let buf = decoded.get(k);
  if (!buf) {
    let base = decoded.get(key + '@1');
    if (!base) { base = await c.decodeAudioData(bytes.slice(0)); decoded.set(key + '@1', base); }
    buf = r === 1 ? base : stretch(c, base, r); decoded.set(k, buf);
  }
  if (my !== seq) return false;
  return new Promise<boolean>(resolve => {
    const src = c.createBufferSource(); src.buffer = buf!; const g = c.createGain(); g.gain.value = vol; src.connect(g).connect(c.destination);
    let done = false; const fin = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
    src.onended = () => fin(true);
    current = { stop: () => { try { src.stop(); } catch { /* ignore */ } fin(false); } };
    src.start();
  });
}
async function playElement(bytes: ArrayBuffer, r: number, my: number, vol = 1): Promise<boolean> {
  el = el || new Audio();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  const a = el; (a as any).preservesPitch = true; (a as any).webkitPreservesPitch = true; (a as any).mozPreservesPitch = true;
  a.src = url; a.playbackRate = r; a.volume = Math.max(0, Math.min(1, vol));
  return new Promise<boolean>((resolve, reject) => {
    let done = false;
    const cleanup = () => { a.onended = a.onerror = null; setTimeout(() => URL.revokeObjectURL(url), 1000); };
    const fin = (ok: boolean) => { if (!done) { done = true; clearTimeout(guard); cleanup(); resolve(ok); } };
    a.onended = () => fin(true);
    const guard = setTimeout(() => fin(true), 15000); // never hang the UI on a stalled element
    a.onerror = () => { if (!done) { done = true; cleanup(); reject(new Error('media error')); } };
    current = { stop: () => { try { a.pause(); } catch { /* ignore */ } fin(false); } };
    if (my !== seq) return fin(false);
    a.play().catch(e => { if (!done) { done = true; cleanup(); reject(e); } });
  });
}
async function playCourse(text: string, slow?: boolean, voice?: 'f' | 'm', my = seq): Promise<boolean | null> {
  if (source !== 'course') return null;
  const f = findClip(text, voice);
  if (!f || (!f.clip[3] && voices.length)) return null; // unverified clip: prefer a device voice if there is one
  const file = f.ix.files[f.clip[0]];
  const all = await packBytes(file);
  const bytes = all.slice(f.clip[1], f.clip[1] + f.clip[2]);
  if (my !== seq) return false;
  const r = playbackRate(slow);
  if (!useWebAudio) {
    try { return await playElement(bytes, r, my, f.clip[4] ?? 1); }
    catch (e: any) { if (e?.name === 'NotAllowedError') throw e; useWebAudio = true; }
  }
  return playWebAudio(bytes, f.key, r, my, f.clip[4] ?? 1);
}

/** Speak Chinese text: the course's recorded voice when available, otherwise the device voice. Resolves when finished. */
export async function say(text: string, opts: { slow?: boolean; voice?: 'f' | 'm' } = {}): Promise<boolean> {
  if (!text) return false;
  const my = ++seq;
  current?.stop(); current = null;
  try { synth?.cancel(); } catch { /* ignore */ }
  try {
    const r = await playCourse(text, opts.slow, opts.voice, my);
    if (r !== null) { (window as any).__lxLastAudio = 'course'; (window as any).__lxLastAudioOk = r; return r; }
  } catch { /* fall back to the device voice */ }
  if (my !== seq) return false;
  (window as any).__lxLastAudio = 'device';
  return sayDevice(text, opts, my);
}
async function sayDevice(text: string, opts: { slow?: boolean }, my: number): Promise<boolean> {
  if (!synth) return false;
  try {
    if (synth.speaking || synth.pending) { synth.cancel(); await sleep(60); } // Chrome drops an utterance spoken right after cancel
    if (my !== seq) return false;
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = chosen?.lang || 'zh-CN';
    if (chosen) u.voice = chosen;
    u.rate = opts.slow ? Math.max(0.45, rate * 0.6) : rate;
    return await new Promise<boolean>(resolve => {
      let done = false;
      const fin = (ok: boolean) => { if (!done) { done = true; clearTimeout(t); resolve(ok); } };
      u.onend = () => fin(true); u.onerror = () => fin(false);
      const t = setTimeout(() => fin(true), 2000 + String(text).length * (opts.slow ? 700 : 450));
      current = { stop: () => { try { synth.cancel(); } catch { /* ignore */ } fin(false); } };
      synth.speak(u);
    });
  } catch { return false; }
}
export function stopSpeech() { seq++; current?.stop(); current = null; try { synth?.cancel(); } catch { /* ignore */ } }
export const ttsSupported = () => !!synth;
/** A Mandarin device voice is installed. */
export const ttsAvailable = () => !!(synth && voices.length);
/** Any audio is available: course clips (shared index loaded) or a device voice. */
export const audioAvailable = () => (source === 'course' && indexes.has('shared')) || ttsAvailable();
export const courseAudioLoaded = () => indexes.has('shared');
export const getVoices = () => voices;
export const getChosen = () => chosen;
export function configureAudio(o: { voice?: string; rate?: number; sound?: boolean; source?: 'course' | 'device' }) {
  if (o.voice !== undefined) { preferredURI = o.voice; chosen = voices.find(v => v.voiceURI === preferredURI) || voices[0] || null; }
  if (o.rate !== undefined) rate = o.rate;
  if (o.sound !== undefined) soundOn = o.sound;
  if (o.source !== undefined && o.source !== source) { source = o.source; listeners.forEach(f => f()); }
}
export const onVoicesChanged = (f: Listener) => { listeners.add(f); return () => listeners.delete(f); };

// ---------- chimes & haptics ----------
let ctx: AudioContext | null = null;
export function actx(): AudioContext | null {
  if (!ctx) { const C = window.AudioContext || (window as any).webkitAudioContext; if (C) ctx = new C(); }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const c = actx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}
export function chime(kind: 'ok' | 'bad' | 'done' | 'tap') {
  if (!soundOn) return;
  try {
    if (kind === 'ok') { tone(784, 0, 0.18); tone(1175, 0.09, 0.28); }
    else if (kind === 'bad') { tone(220, 0, 0.25, 'triangle', 0.14); tone(180, 0.12, 0.3, 'triangle', 0.12); }
    else if (kind === 'done') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.35));
    else tone(660, 0, 0.06, 'sine', 0.05);
  } catch { /* ignore */ }
}
export function buzz(pattern: number | number[] = [25, 40, 25]) { try { if (soundOn) navigator.vibrate?.(pattern); } catch { /* ignore */ } }
