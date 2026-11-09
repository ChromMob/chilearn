/** Loads compiled course data with retries; keeps a word index across loaded levels. */
import type { Core, LevelData, LevelKey, UnitData, Word } from './types';
import { setCharPinyin } from './speechScore';
import { sleep } from './util';
import { loadAudioIndex } from './audio';

const BASE = './data/';
export const D = {
  core: null as Core | null,
  levels: {} as Partial<Record<LevelKey, LevelData>>,
  words: new Map<string, Word>(),
  syl: {} as Record<string, string>,
  strokes: {} as Record<string, unknown>,
  loading: {} as Record<string, Promise<unknown>>,
};

export async function fetchJson<T>(url: string, { retries = 3, timeout = 25000 } = {}): Promise<T> {
  let last: unknown;
  for (let a = 0; a <= retries; a++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl?.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctl?.signal, cache: a ? 'reload' : 'default' });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return (await r.json()) as T;
    } catch (e) { last = e; if (a < retries) await sleep(400 * 2 ** a); }
    finally { clearTimeout(t); }
  }
  throw last;
}

export async function initData(): Promise<Core> {
  const [core, syl, charpy] = await Promise.all([
    fetchJson<Core>(BASE + 'core.json'),
    fetchJson<Record<string, string>>(BASE + 'syllables.json'),
    fetchJson<Record<string, string>>(BASE + 'charpy.json').catch(() => ({})),
  ]);
  D.core = core; D.syl = syl; setCharPinyin(charpy);
  return core;
}

export function loadLevel(k: LevelKey): Promise<LevelData | null> {
  if (k === '0') return Promise.resolve(null);
  loadAudioIndex(k);
  if (D.levels[k]) return Promise.resolve(D.levels[k]!);
  if (!D.loading[k]) {
    D.loading[k] = fetchJson<LevelData>(`${BASE}L${k}.json`).then(L => {
      D.levels[k] = L;
      for (const [zh, a] of Object.entries(L.words)) if (!D.words.has(zh)) D.words.set(zh, { zh, py: a[0], g: a[1], en: a[2], pos: a[3] || '', l: k });
      for (const u of L.units) {
        u.level = k;
        for (const [t, g] of Object.entries(u.extra || {})) if (!D.words.has(t)) D.words.set(t, { zh: t, py: u.xpy?.[t] || '', g, en: g, l: k, extra: true });
      }
      return L;
    }).catch(e => { delete D.loading[k]; throw e; });
  }
  return D.loading[k] as Promise<LevelData>;
}
export async function loadLevelsUpTo(k: LevelKey, order: LevelKey[]) {
  const idx = order.indexOf(k);
  await Promise.all(order.slice(1, idx + 1).filter(x => D.core?.levels.some(l => l.key === x)).map(x => loadLevel(x).catch(() => null)));
}
export async function strokeData(ch: string): Promise<any | null> {
  if (D.strokes[ch]) return D.strokes[ch];
  const lv = D.core?.charLevel[ch];
  if (!lv) return null;
  const key = 's' + lv;
  if (!D.loading[key]) D.loading[key] = fetchJson<Record<string, unknown>>(`${BASE}strokes-${lv}.json`).then(m => Object.assign(D.strokes, m)).catch(e => { delete D.loading[key]; throw e; });
  try { await D.loading[key]; } catch { return null; }
  return D.strokes[ch] || null;
}
export const word = (zh: string) => D.words.get(zh) || null;
export const unitData = (k: LevelKey, id: string): UnitData | null => D.levels[k]?.units.find(u => u.id === id) || null;
export const sylChar = (base: string, tone: number) => D.syl[base + tone] || null;
export const hasStrokes = (ch: string) => !!D.core?.charLevel[ch];
// test/debug hook: lets automated tests and support look up a loaded word
if (typeof window !== 'undefined') (window as any).__lxWord = (zh: string) => D.words.get(zh) || null;
