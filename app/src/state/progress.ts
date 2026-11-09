/** Learner progress: zustand store persisted to localStorage, synced (merged) to the Claude artifact's private db when available. */
import { create } from 'zustand';
import { newCard, reviewCard, learnCard, seedKnownCard, type Card, type Grade } from '../lib/srs';
import { addDays, dayKey, withTimeout } from '../lib/util';
import type { VoiceCal } from '../lib/pitch';

export type PinyinMode = 'always' | 'hint' | 'never';
export interface Settings { goal: number; pinyin: PinyinMode; rate: number; voice: string; speaking: boolean; writing: boolean; sound: boolean; theme: '' | 'light' | 'dark'; audio: 'course' | 'device' }
export interface Done { best: number; n: number; at: number; skipped?: boolean }
export interface DayStat { xp: number; items: number; ok: number }
export interface SetupState { font?: boolean; tts?: boolean; mic?: boolean; rec?: boolean; asr?: boolean; tone?: boolean; at?: number }
export interface Progress {
  v: 2; created: number; updatedAt: number; onboarded: boolean; placement?: 'zero' | 'test';
  settings: Settings; done: Record<string, Done>; srs: Record<string, Card>; days: Record<string, DayStat>;
  streak: { cur: number; best: number; last: string }; voiceCal: VoiceCal; speakOffUntil: number;
  totals: { lessons: number; items: number; ok: number; spoken: number; written: number };
  setup: SetupState; dismissed: Record<string, boolean>;
}
const KEY = 'luxian.v2';
export const defaultSettings: Settings = { goal: 30, pinyin: 'always', rate: 0.85, voice: '', speaking: true, writing: true, sound: true, theme: '', audio: 'course' };
export function freshProgress(): Progress {
  return {
    v: 2, created: Date.now(), updatedAt: 0, onboarded: false, settings: { ...defaultSettings }, done: {}, srs: {}, days: {},
    streak: { cur: 0, best: 0, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0,
    totals: { lessons: 0, items: 0, ok: 0, spoken: 0, written: 0 }, setup: {}, dismissed: {},
  };
}
function normalize(p: any): Progress {
  const f = freshProgress();
  const out: Progress = { ...f, ...(p || {}), v: 2 };
  out.settings = { ...f.settings, ...(p?.settings || {}) };
  out.totals = { ...f.totals, ...(p?.totals || {}) };
  out.streak = { ...f.streak, ...(p?.streak || {}) };
  out.voiceCal = { ...f.voiceCal, ...(p?.voiceCal || {}) };
  out.setup = { ...(p?.setup || {}) }; out.dismissed = { ...(p?.dismissed || {}) };
  out.done = { ...(p?.done || {}) }; out.srs = { ...(p?.srs || {}) }; out.days = { ...(p?.days || {}) };
  return out;
}
function loadLocal(): Progress {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('luxian.v1');
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* storage unavailable */ }
  return freshProgress();
}

/** Merge two progress records field by field so no device ever loses work. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  const out = normalize({ ...newer });
  out.onboarded = a.onboarded || b.onboarded;
  out.done = { ...b.done };
  for (const [k, d] of Object.entries(a.done)) { const o = out.done[k]; out.done[k] = !o ? d : { best: Math.max(o.best, d.best), n: Math.max(o.n, d.n), at: Math.max(o.at || 0, d.at || 0), skipped: o.skipped && d.skipped }; }
  out.srs = { ...b.srs };
  for (const [w, c] of Object.entries(a.srs)) { const o = out.srs[w]; if (!o || c.n + c.x > o.n + o.x || (c.n + c.x === o.n + o.x && c.d > o.d)) out.srs[w] = c; }
  out.days = { ...b.days };
  for (const [k, d] of Object.entries(a.days)) { const o = out.days[k]; out.days[k] = !o ? d : { xp: Math.max(o.xp, d.xp), items: Math.max(o.items, d.items), ok: Math.max(o.ok, d.ok) }; }
  out.streak = a.streak.last > b.streak.last ? a.streak : b.streak.last > a.streak.last ? b.streak : (a.streak.cur >= b.streak.cur ? a.streak : b.streak);
  out.streak = { ...out.streak, best: Math.max(a.streak.best, b.streak.best) };
  for (const k of Object.keys(out.totals) as (keyof Progress['totals'])[]) out.totals[k] = Math.max(a.totals[k] || 0, b.totals[k] || 0);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

interface Actions {
  set: (fn: (p: Progress) => void) => void;
  setSettings: (patch: Partial<Settings>) => void;
  markDone: (lessonId: string, score: number) => void;
  learn: (word: string, level: string, mistake: boolean) => void;
  review: (word: string, level: string, grade: Grade) => void;
  seedKnown: (words: { w: string; level: string }[]) => void;
  addXp: (n: number) => { goalReached: boolean; streak: number };
  countItem: (ok: boolean) => void;
  reset: () => void;
  replace: (p: Progress) => void;
}
export type ProgressStore = Progress & Actions;

export const useProgress = create<ProgressStore>()((setState, get) => {
  const mut = (fn: (p: Progress) => void) => setState(s => {
    const draft = normalize(s as Progress);
    fn(draft); draft.updatedAt = Date.now();
    return draft;
  });
  return {
    ...loadLocal(),
    set: mut,
    setSettings: patch => mut(p => { p.settings = { ...p.settings, ...patch }; }),
    markDone: (id, score) => mut(p => { const d = p.done[id] || { best: 0, n: 0, at: 0 }; p.done[id] = { best: Math.max(d.best, score), n: d.n + 1, at: Date.now() }; p.totals.lessons++; }),
    learn: (w, level, mistake) => mut(p => { p.srs[w] = learnCard(p.srs[w] || newCard(level), mistake); }),
    review: (w, level, grade) => mut(p => { p.srs[w] = reviewCard(p.srs[w] || newCard(level), grade); }),
    seedKnown: list => mut(p => { for (const { w, level } of list) p.srs[w] = seedKnownCard(p.srs[w] || newCard(level)); }),
    addXp: n => {
      let goalReached = false, streak = 0;
      mut(p => {
        const k = dayKey(); const d = (p.days[k] = p.days[k] || { xp: 0, items: 0, ok: 0 });
        const before = d.xp; d.xp += n;
        if (before < p.settings.goal && d.xp >= p.settings.goal && p.streak.last !== k) {
          p.streak.cur = p.streak.last === addDays(k, -1) ? p.streak.cur + 1 : 1;
          p.streak.last = k; p.streak.best = Math.max(p.streak.best, p.streak.cur); goalReached = true;
        }
        streak = p.streak.cur;
      });
      return { goalReached, streak };
    },
    countItem: ok => mut(p => { const k = dayKey(); const d = (p.days[k] = p.days[k] || { xp: 0, items: 0, ok: 0 }); d.items++; if (ok) d.ok++; p.totals.items++; if (ok) p.totals.ok++; }),
    reset: () => setState(() => ({ ...freshProgress(), updatedAt: Date.now() })),
    replace: p => setState(() => normalize(p)),
  };
});

export const getProgress = () => useProgress.getState() as Progress;
export function streakNow(p: Progress = getProgress()): number {
  const k = dayKey();
  return p.streak.last === k || p.streak.last === addDays(k, -1) ? p.streak.cur : 0;
}
export const todayStat = (p: Progress = getProgress()): DayStat => p.days[dayKey()] || { xp: 0, items: 0, ok: 0 };
export function dueCount(p: Progress = getProgress(), now = Date.now()) { let n = 0; for (const c of Object.values(p.srs)) if (c.s && c.d <= now) n++; return n; }
export function dueWords(limit = 9999, p: Progress = getProgress(), now = Date.now()) {
  return Object.entries(p.srs).filter(([, c]) => c.s && c.d <= now).sort((a, b) => a[1].d - b[1].d).slice(0, limit).map(([w, c]) => ({ w, c }));
}
export function weakWords(n = 15, p: Progress = getProgress()) {
  return Object.entries(p.srs).filter(([, c]) => c.s).sort((a, b) => (b[1].x * 3 - b[1].i) - (a[1].x * 3 - a[1].i)).slice(0, n).map(([w, c]) => ({ w, c }));
}
export const speakingOn = (p: Progress = getProgress()) => p.settings.speaking && Date.now() > (p.speakOffUntil || 0);

// ---------- persistence ----------
function serialize(p: ProgressStore | Progress): Progress {
  const { set, setSettings, markDone, learn, review, seedKnown, addXp, countItem, reset, replace, ...data } = p as any;
  return data as Progress;
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProgress.subscribe(state => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(serialize(state))); } catch { /* quota or blocked */ }
    Cloud.push();
  }, 350);
});
export function exportCode(): string { return btoa(unescape(encodeURIComponent(JSON.stringify(serialize(getProgress()))))); }
export function importCode(code: string) {
  const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!obj || !obj.done || !obj.srs) throw new Error('This isn’t a Lùxiàn progress code.');
  useProgress.getState().replace(mergeProgress(normalize(obj), getProgress()));
}

// ---------- cloud sync (Claude artifact viewer only) ----------
type Sync = 'local' | 'connecting' | 'synced' | 'error';
export const Cloud = {
  db: null as any, uid: '' as string, status: 'local' as Sync, busy: false, dirty: false, lastSrs: {} as Record<string, string>,
  listeners: new Set<() => void>(),
  setStatus(s: Sync) { this.status = s; this.listeners.forEach(f => f()); },
  async init() {
    const w = window as any;
    if (!w.claude?.use) return;
    this.setStatus('connecting');
    try {
      const [db, user] = await Promise.all([w.claude.use('db'), w.claude.use('user')]);
      if (!db || !user) return this.setStatus('local');
      const uid = await user.id(); if (!uid) return this.setStatus('local');
      this.db = db; this.uid = uid;
      const col = db.collection('data/users/' + uid);
      const snap: any = await withTimeout(col.doc("progress").get(), 12000);
      if (snap.exists) {
        const remote = normalize((snap.data() || {}).main || {});
        remote.updatedAt = (snap.data() || {}).updatedAt || 0;
        remote.srs = {};
        for (const lk of ['0', '1', '2', '3', '4', '5', '6', 'adv']) {
          try {
            const s2: any = await withTimeout(col.doc("srs-" + lk).get(), 12000);
            if (s2.exists) for (const [k, a] of Object.entries((s2.data() || {}).w || {}) as [string, number[]][]) remote.srs[k] = { l: lk, i: a[0], e: a[1], d: a[2] * 60000, n: a[3], x: a[4], s: !!a[5] };
          } catch { /* skip one level */ }
        }
        useProgress.getState().replace(mergeProgress(getProgress(), remote));
      }
      this.setStatus('synced');
      this.push();
    } catch (e) { console.warn('sync unavailable', e); this.setStatus('local'); this.db = null; }
  },
  async push() {
    if (!this.db) return;
    if (this.busy) { this.dirty = true; return; }
    this.busy = true;
    try {
      const col = this.db.collection('data/users/' + this.uid);
      const p = serialize(getProgress());
      const { srs, ...main } = p;
      const groups: Record<string, Record<string, number[]>> = {};
      for (const [w, c] of Object.entries(srs)) (groups[c.l] = groups[c.l] || {})[w] = [c.i, c.e, Math.round(c.d / 60000), c.n, c.x, c.s ? 1 : 0];
      for (const [lk, w] of Object.entries(groups)) {
        const js = JSON.stringify(w); if (this.lastSrs[lk] === js) continue;
        await col.doc('srs-' + lk).set({ w }); this.lastSrs[lk] = js;
      }
      await col.doc('progress').set({ updatedAt: p.updatedAt, main });
      this.setStatus('synced');
    } catch (e) { console.warn('sync failed', e); this.setStatus('error'); }
    this.busy = false;
    if (this.dirty) { this.dirty = false; setTimeout(() => this.push(), 2000); }
  },
};
