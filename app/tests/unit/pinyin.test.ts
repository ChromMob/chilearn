import { describe, it, expect } from 'vitest';
import { parseMarked, numToMark, gradePinyin, normPinyinInput, stripTones, hanOnly, isPunct } from '../../src/lib/pinyin';

describe('pinyin parsing', () => {
  it('parses tone-marked syllables', () => {
    expect(parseMarked('nǐ hǎo')).toEqual([{ base: 'ni', tone: 3 }, { base: 'hao', tone: 3 }]);
    expect(parseMarked('lǜ')).toEqual([{ base: 'lü', tone: 4 }]);
    expect(parseMarked('xiè xie')[1]).toEqual({ base: 'xie', tone: 5 });
    expect(parseMarked("xī'ān").length).toBe(2);
  });
  it('places tone marks by the standard rules', () => {
    expect(numToMark('ma3')).toBe('mǎ'); expect(numToMark('liu4')).toBe('liù'); expect(numToMark('gui4')).toBe('guì');
    expect(numToMark('lv4')).toBe('lǜ'); expect(numToMark('zhou1')).toBe('zhōu'); expect(numToMark('de5')).toBe('de'); expect(numToMark('xue2')).toBe('xué');
  });
  it('normalizes learner input', () => {
    expect(normPinyinInput('Ni3 hao3')).toEqual({ letters: 'nihao', tones: [3, 3], anyTone: true });
    expect(normPinyinInput('nǐhǎo').tones).toEqual([3, 3]);
    expect(normPinyinInput('lv4').letters).toBe('lü');
    expect(stripTones('zhōng guó')).toBe('zhong guo');
  });
});
describe('pinyin grading', () => {
  it('accepts numbers or marks, with or without spaces', () => {
    for (const a of ['ni3 hao3', 'ni3hao3', 'nǐ hǎo', 'NI3HAO3', 'ni2 hao3']) expect(gradePinyin(a, 'nǐ hǎo', '你好')).toBe('right');
  });
  it('flags tone mistakes separately from spelling mistakes', () => {
    expect(gradePinyin('ni hao', 'nǐ hǎo', '你好')).toBe('tones');
    expect(gradePinyin('ni4 hao3', 'nǐ hǎo', '你好')).toBe('tones');
    expect(gradePinyin('li3 hao3', 'nǐ hǎo', '你好')).toBe('wrong');
  });
  it('handles neutral tones and 一/不 tone changes', () => {
    expect(gradePinyin('xie4xie', 'xiè xie', '谢谢')).toBe('right');
    expect(gradePinyin('xie4 xie5', 'xiè xie', '谢谢')).toBe('right');
    expect(gradePinyin('yi4qi3', 'yī qǐ', '一起')).toBe('right');
    expect(gradePinyin('yi1qi3', 'yī qǐ', '一起')).toBe('right');
    expect(gradePinyin('bu2 shi4', 'bù shì', '不是')).toBe('right');
    expect(gradePinyin('lv4se4', 'lǜ sè', '绿色')).toBe('right');
  });
  it('identifies Chinese characters and punctuation', () => {
    expect(hanOnly('我有3个，朋友！')).toBe('我有个朋友'); expect(isPunct('。')).toBe(true); expect(isPunct('我')).toBe(false);
  });
});
