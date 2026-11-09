import { numToMark } from '../pinyin';
import type { Verdict } from './ctc';
/** One-line feedback for per-syllable verdicts, e.g. “Tone off on 好 (sounded like hào).” */
export function verdictNote(v: Verdict[]): string {
  const tone = v.filter(x => x.mark === 'tone'), no = v.filter(x => x.mark === 'no');
  const parts: string[] = [];
  if (no.length) parts.push(`didn’t catch ${no.map(x => x.ch).join('、')}`);
  const hard = tone.filter(x => !x.soft), soft = tone.filter(x => x.soft);
  const fmt = (xs: Verdict[]) => xs.map(x => (x.heard ? `${x.ch} (sounded like ${numToMark(x.heard)})` : x.ch)).join('、');
  if (hard.length) parts.push(`tone off on ${fmt(hard)}`);
  if (soft.length) parts.push(`the pitch on ${fmt(soft)} may be off: compare the lines below`);
  const s = parts.join('; ');
  return s ? s[0].toUpperCase() + s.slice(1) + '.' : '';
}
