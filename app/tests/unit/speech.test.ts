import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { setCharPinyin, scoreTranscript, speechPasses, numToHan } from '../../src/lib/speechScore';

beforeAll(() => setCharPinyin(JSON.parse(fs.readFileSync('public/data/charpy.json', 'utf8'))));
describe('speech scoring', () => {
  it('passes an exact transcript, ignoring punctuation', () => {
    const s = scoreTranscript('我想买东西', '我想买东西。'); expect(s.score).toBe(1); expect(speechPasses(s, false)).toBe(true);
  });
  it('accepts homophones with the same tone (他/她)', () => {
    expect(scoreTranscript('她是我的老师', '他是我的老师').marks.every(m => m === 'ok')).toBe(true);
  });
  it('flags a wrong tone (买 mǎi heard as 卖 mài)', () => {
    const s = scoreTranscript('买', '卖'); expect(s.marks).toEqual(['tone']); expect(speechPasses(s, true)).toBe(false);
  });
  it('converts digits from the recognizer', () => {
    expect(numToHan('3个')).toBe('三个'); expect(numToHan('25岁')).toBe('二十五岁'); expect(numToHan('10')).toBe('十');
    expect(scoreTranscript('我有三个朋友', '我有3个朋友').score).toBe(1);
  });
  it('fails partial or empty speech', () => {
    expect(speechPasses(scoreTranscript('今天天气很好', '今天天气'), false)).toBe(false);
    expect(scoreTranscript('我是学生', '').score).toBe(0);
  });
});
