/** Spaced repetition (SM-2 family, day intervals with short relearning steps). Pure functions on a card. */
import { DAY } from './util';
export interface Card { l: string; i: number; e: number; d: number; n: number; x: number; s: boolean }
export type Grade = 0 | 1 | 2; // wrong | hard/partial | good

export const newCard = (level: string, now = Date.now()): Card => ({ l: level, i: 0, e: 250, d: now, n: 0, x: 0, s: false });

export function reviewCard(c: Card, grade: Grade, now = Date.now(), rnd = Math.random): Card {
  const n = { ...c, s: true };
  if (grade === 0) { n.x++; n.e = Math.max(130, n.e - 20); n.i = 0; n.d = now + 10 * 60_000; return n; }
  n.n++;
  if (grade === 1) { n.e = Math.max(130, n.e - 15); n.i = n.i < 1 ? 0.5 : Math.max(1, n.i * 1.2); }
  else if (n.i < 1) n.i = n.i === 0 ? 1 : 2;
  else if (n.i < 3) n.i = 4;
  else { n.i = Math.min(365, (n.i * n.e) / 100); n.e = Math.min(300, n.e + 5); }
  const jitter = n.i >= 4 ? (rnd() * 0.1 - 0.05) * n.i : 0;
  n.d = now + Math.max(0.15, n.i + jitter) * DAY;
  return n;
}
/** First exposure in a lesson: due tomorrow, or in a few hours after a mistake. */
export function learnCard(c: Card, hadMistake: boolean, now = Date.now()): Card {
  if (c.s && c.i >= 1) return c;
  return { ...c, s: true, i: hadMistake ? 0.5 : 1, d: now + (hadMistake ? 0.2 : 1) * DAY };
}
/** Already known (placement or test-out): spread first reviews over the coming weeks. */
export function seedKnownCard(c: Card, now = Date.now(), rnd = Math.random): Card {
  if (c.s) return c;
  const i = 4 + Math.round(rnd() * 20);
  return { ...c, s: true, i, e: 250, d: now + rnd() * i * DAY };
}
export const isDue = (c: Card, now = Date.now()) => c.s && c.d <= now;
export function strength(c?: Card): 0 | 1 | 2 | 3 | 4 {
  if (!c || !c.s) return 0;
  if (c.i >= 30) return 4; if (c.i >= 10) return 3; if (c.i >= 3) return 2; return 1;
}
