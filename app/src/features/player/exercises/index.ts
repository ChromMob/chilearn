import type { ComponentType } from 'react';
import type { ExType } from '../../../lib/types';
import type { ExProps } from '../types';
import { Intro, McMeaning, McHanzi, ListenPick, Tones, TypePinyin, Match, Write } from './WordEx';
import { Build, ListenBuild, McTranslate, Fill } from './SentenceEx';
import { GrammarCard, DialogueCard, ReadingCard, QuestionEx, ChengyuCard, McChengyu, FillChengyu } from './Cards';
import { Speak, ToneSpeak } from './SpeakEx';
import { PinIntro, PinToneListen, PinPick, PinType, Sandhi } from './PinyinEx';

export const EXERCISES: Record<ExType, ComponentType<ExProps>> = {
  intro: Intro, mc_meaning: McMeaning, mc_hanzi: McHanzi, listen_pick: ListenPick, tones: Tones, type_pinyin: TypePinyin, match: Match, write: Write,
  build: Build, listen_build: ListenBuild, mc_translate: McTranslate, fill: Fill,
  grammar_card: GrammarCard, dialogue_card: DialogueCard, reading_card: ReadingCard, question: QuestionEx, chengyu_card: ChengyuCard, mc_chengyu: McChengyu, fill_chengyu: FillChengyu,
  speak: Speak, tone_speak: ToneSpeak,
  pin_intro: PinIntro, pin_tone_listen: PinToneListen, pin_pick: PinPick, pin_type: PinType, sandhi: Sandhi,
};
