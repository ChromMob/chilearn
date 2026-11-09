/** Course data shapes (compiled by build/compile.js). */
export type LevelKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | 'adv';
export interface Word { zh: string; py: string; g: string; en: string; l: LevelKey; pos?: string; extra?: boolean }
export interface Sentence { t: string[]; p: string[]; en: string; alt?: string[][]; f?: number }
export interface Grammar { title: string; pattern: string; explain: string; examples: Sentence[] }
export interface Question { q: string; qEn?: string; options: string[]; answer: number }
export interface DialogueLine extends Sentence { who: string }
export interface Dialogue { title: string; lines: DialogueLine[]; questions: Question[] }
export interface Reading { title: string; zh: string; py: string[]; en: string; questions: Question[] }
export interface Chengyu { zh: string; py: string; lit: string; en: string; example: { zh: string; en: string } }
export interface UnitData {
  id: string; words: string[]; extra: Record<string, string>; xpy?: Record<string, string>;
  grammar: Grammar[]; sentences: Sentence[]; dialogue?: Dialogue; reading?: Reading; chengyu?: Chengyu[]; level: LevelKey;
}
export interface LevelData { key: LevelKey; words: Record<string, [string, string, string, string?]>; units: UnitData[] }
export interface UnitMeta { id: string; title: string; titleZh: string; goal: string; nw: number; g: number; s: number; d: number; r: number; c: number }
export interface Core { version: number; levels: { key: LevelKey; units: UnitMeta[] }[]; charLevel: Record<string, LevelKey> }

export type LessonKind = 'words' | 'grammar' | 'sentences' | 'story' | 'chengyu' | 'test'
  | 'p-tones-intro' | 'p-tones-ear' | 'p-tones-say' | 'p-sounds-ear' | 'p-sounds-type' | 'p-pairs' | 'p-sandhi' | 'p-test';
export interface Lesson { id: string; level: LevelKey; unitId: string; kind: LessonKind; title: string; sub: string; idx?: number; batch?: number; test?: boolean; pos: number }
export interface Unit extends UnitMeta { level: LevelKey; lessons: Lesson[]; kind?: string; syl?: string[]; note?: string }
export interface Level { key: LevelKey; name: string; short: string; hz: string; title: string; blurb: string; cefr: string; units: Unit[]; pending?: boolean }

export type ExType = 'intro' | 'mc_meaning' | 'mc_hanzi' | 'listen_pick' | 'tones' | 'type_pinyin' | 'build' | 'listen_build' | 'mc_translate' | 'fill'
  | 'speak' | 'write' | 'match' | 'grammar_card' | 'dialogue_card' | 'reading_card' | 'question' | 'chengyu_card' | 'mc_chengyu' | 'fill_chengyu'
  | 'pin_intro' | 'pin_tone_listen' | 'pin_pick' | 'pin_type' | 'tone_speak' | 'sandhi';
/** One exercise. Fields depend on type; see features/player/exercises. */
export interface Item {
  type: ExType; level: LevelKey; words?: string[]; intro?: boolean; review?: boolean; noRequeue?: boolean;
  w?: string; wobj?: Word; options?: any[]; s?: Sentence; idx?: number; extraTiles?: string[]; unit?: UnitData;
  text?: string; toks?: string[]; pys?: string[]; en?: string; py?: string; isWord?: boolean;
  pairs?: Word[]; g?: Grammar; d?: Dialogue; r?: Reading; q?: Question; ref?: Dialogue | Reading; c?: Chengyu;
  topic?: string; note?: string; title?: string; syl?: string[]; base?: string; t?: number; ch?: string; visual?: boolean;
  it?: { zh: string; said: string; cite: string; rule: string };
}
