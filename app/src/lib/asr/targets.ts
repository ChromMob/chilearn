/** Expected syllables (character + reading) for a speaking item, from the course pinyin when it lines up. */
import { hanOnly, parseMarked } from '../pinyin';
import { charReadings, numToHan } from '../speechScore';
import type { Target } from './ctc';

const norm = (base: string) => base.replace(/ü/g, 'v');
/** text: what to say; py: marked pinyin for the whole text, or per token (sentence tokens). */
export function targetsFor(text: string, py?: string | string[]): Target[] {
  const chars = [...hanOnly(numToHan(text || ''))];
  const syl = parseMarked(Array.isArray(py) ? py.join(' ') : py || '');
  const fromPy = syl.length === chars.length;
  return chars.map((ch, i) => {
    if (fromPy) return { ch, base: norm(syl[i].base), tone: syl[i].tone === 5 ? 0 : syl[i].tone };
    const r = charReadings(ch)[0] || '';
    const m = /^([a-zv]+)([0-5])$/.exec(r);
    return m ? { ch, base: m[1], tone: Number(m[2]) % 5 } : { ch, base: '', tone: 0 };
  });
}
