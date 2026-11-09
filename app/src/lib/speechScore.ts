/** Compare a speech-recognition transcript with the target sentence, character by character, tone-aware. */
import { hanOnly } from './pinyin';

let CHARPY: Record<string, string> = {};
export function setCharPinyin(map: Record<string, string>) { CHARPY = map || {}; }
export const charReadings = (ch: string): string[] => (CHARPY[ch] ? CHARPY[ch].split(' ') : []);
const readings = (ch: string) => (CHARPY[ch] ? CHARPY[ch].split(' ') : [ch]);
const toneless = (r: string) => r.replace(/[0-5]$/, '');

const CN_DIGITS: Record<string, string> = { '0': '零', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九' };
/** Recognizers often return digits; convert them to their Chinese reading. */
export function numToHan(s: string): string {
  return s.replace(/\d+/g, m => {
    const n = Number(m);
    if (n > 0 && n < 100 && m.length <= 2) {
      const t = Math.floor(n / 10), o = n % 10;
      return (t > 1 ? CN_DIGITS[t] : '') + (t >= 1 ? '十' : '') + (o ? CN_DIGITS[o] : t ? '' : '零');
    }
    return [...m].map(d => CN_DIGITS[d]).join('');
  });
}
export type Mark = 'ok' | 'tone' | 'no';
export interface SpeechScore { score: number; marks: Mark[]; chars: string[] }

export function scoreTranscript(target: string, heard: string): SpeechScore {
  const T = [...hanOnly(numToHan(target || ''))];
  const H = [...hanOnly(numToHan(heard || ''))];
  if (!T.length) return { score: 0, marks: [], chars: [] };
  const loose = (a: string, b: string) => a === b || readings(a).some(r => readings(b).map(toneless).includes(toneless(r)));
  const exact = (a: string, b: string) => a === b || readings(a).some(r => readings(b).includes(r)) || (readings(a).some(r => /[05]$/.test(r)) && loose(a, b));
  const n = T.length, m = H.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = loose(T[i], H[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const marks: Mark[] = new Array(n).fill('no');
  let i = 0, j = 0, hit = 0, credit = 0;
  while (i < n && j < m) {
    if (loose(T[i], H[j])) { const ex = exact(T[i], H[j]); marks[i] = ex ? 'ok' : 'tone'; credit += ex ? 1 : 0.5; hit++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const extra = Math.max(0, m - hit);
  return { score: Math.max(0, (credit - extra * 0.5) / n), marks, chars: T };
}
/** Pass rule: words need every syllable right; sentences need 80% and at most one tone slip. */
export function speechPasses(s: SpeechScore, isWord: boolean): boolean {
  const tones = s.marks.filter(m => m === 'tone').length;
  const need = isWord ? (s.chars.length <= 2 ? 1 : 0.75) : 0.8;
  return s.score >= need && (isWord ? tones === 0 : tones <= 1);
}
