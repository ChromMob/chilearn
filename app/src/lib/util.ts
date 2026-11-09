/** Small shared helpers: randomness, dates, async. */
export function shuffle<T>(a: readonly T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const sampleN = <T,>(a: readonly T[], n: number): T[] => shuffle(a).slice(0, n);
export function uniqBy<T>(a: readonly T[], f: (x: T) => unknown): T[] {
  const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; });
}
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const DAY = 86_400_000;
export function dayKey(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label)), ms))]);
}
export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
