# Lùxiàn Mandarin — course content spec

You are writing course content for a Mandarin (Simplified Chinese, mainland standard) learning web app that takes
English speakers from zero to native-like fluency. The app turns your content into self-checking exercises
automatically: tile sentence building (English → Chinese), listening (TTS reads your Chinese), speaking (speech
recognition compares the learner to your Chinese), fill-in-the-blank, translation choice, reading comprehension.
So **every Chinese string must be correct, natural, and exactly what a native speaker would say**. Accuracy matters more
than quantity.

Pinyin is generated automatically from your Chinese — do not write pinyin for sentences.

## File format

One JSON file per level, UTF-8, at `build/content/<name>.json`:

```json
{
  "level": 1,
  "units": [ UNIT, UNIT, ... ]
}
```

`level` is `1`..`6` (HSK 2.0 level) or `"adv"` (post-HSK mastery).

### UNIT

```json
{
  "id": "h1u01",
  "title": "Hello!",
  "titleZh": "你好",
  "goal": "Greet people, say goodbye and thank someone.",
  "words": ["你", "好", "你好", "再见"],
  "glosses": { "你": "you", "好": "good; well", "你好": "hello", "再见": "goodbye" },
  "pinyin": { "了": "le" },
  "extra": { "李明": "Li Ming (a name)" },
  "grammar": [
    {
      "title": "Adjectives as predicates with 很",
      "pattern": "Subject + 很 + Adjective",
      "explain": "Chinese adjectives work like verbs: no 'to be' (是) is needed. 很 ('very') is usually added and often just means 'is'.",
      "examples": [ { "zh": "我 很 好 。", "en": "I'm fine." }, { "zh": "你 好 吗 ？", "en": "How are you?" } ]
    }
  ],
  "sentences": [
    { "zh": "你 好 ！", "en": "Hello!" },
    { "zh": "我 明天 去 北京 。", "en": "I'm going to Beijing tomorrow.", "alt": ["明天 我 去 北京 。"], "focus": "明天" }
  ],
  "dialogue": {
    "title": "Meeting a classmate",
    "lines": [ { "who": "A", "zh": "你 好 ！", "en": "Hello!" }, { "who": "B", "zh": "你 好 ！", "en": "Hi!" } ],
    "questions": [ { "q": "What does B say?", "options": ["Hello", "Goodbye", "Thank you"], "answer": 0 } ]
  },
  "reading": {
    "title": "我的一天",
    "zh": "我每天七点起床。……",
    "en": "I get up at seven every day. ...",
    "questions": [ { "q": "他几点起床？", "qEn": "What time does he get up?", "options": ["六点", "七点", "八点"], "answer": 1 } ]
  }
}
```

Field rules:

- `id`: `h<level>u<NN>` (e.g. `h3u07`), or `advu<NN>` for the mastery level. Unique.
- `title` (English, short, ≤ 5 words), `titleZh` (2–6 characters), `goal`: one "can-do" sentence in English describing what the
  learner can do after the unit.
- `words`: the vocabulary this unit teaches, in teaching order (most useful / building-block words first). Each word must come
  from your level's word list (`build/inputs/hsk<level>_words.txt`). Every word of the level appears in exactly one unit.
  If `build/inputs/hsk<level>_units.json` exists, your units must use exactly those word chunks, in that order (you may reorder
  words inside a unit).
- `glosses`: short English meaning (1–5 words, max 40 chars) for each unit word, as it is used at this level — what a textbook
  vocab list would show. Required for every word in HSK 1–3. For HSK 4+ and adv, include a gloss only where the auto-gloss
  (3rd column of the word list) is wrong, misleading, archaic, or not the common meaning. Glosses are used as multiple-choice
  options, so two words in the same unit should not have the same gloss.
- `pinyin`: optional override (tone marks, syllables space-separated) when the word list's pinyin is not the reading taught at
  this level (e.g. `了` → `le`, `得` → `de`, `地` → `de`). Only for unit words.
- `extra`: tokens used in this unit's Chinese that are NOT in any word list up to this level (names, a necessary extra word).
  Each needs an English gloss. Keep this small; prefer known words. Names: use common ones (王明, 李月, 小张, 大卫, 安娜 …).
- `grammar`: 1–3 points per unit. `explain` is 2–5 plain English sentences for a learner. `pattern` is a formula.
  ≥ 2 examples each. Order grammar so a learner meets basics before advanced structures across the whole level.
- `sentences`: see counts below. Natural, everyday, varied sentences that **use this unit's words** (aim: every unit word
  appears in at least one sentence, reading, or dialogue of its unit) and recycle earlier words. Include questions and answers,
  negatives, and the unit's grammar.
  - `alt`: other word orders a native speaker accepts with exactly the same tokens (e.g. time word before or after the subject).
    Add them whenever the order is genuinely flexible, because the tile exercise marks any other order wrong.
  - `focus`: optional — the token to blank out in fill-in-the-blank (choose the unit word or grammar word the sentence practices).
  - `en`: a natural English translation (not word-for-word).
- `dialogue` (lines with `who`: "A"/"B" or names), ≥ 4 lines, ≥ 2 questions. `reading`: plain Chinese text (no spaces) + full English
  translation + ≥ 3 questions. Question options: 3–4, one correct, `answer` = index. For HSK 1–2 write questions and options in
  English; from HSK 3 write them in Chinese and add `qEn` (English translation of the question).

### Tokenization (very important)

In `sentences[].zh`, `sentences[].alt[]`, `grammar[].examples[].zh` and `dialogue.lines[].zh`, separate **words** with single
spaces, and put **punctuation as its own token** at the end: `我 是 学生 。` The tokens become the tiles the learner arranges,
so split by word (as listed in the word lists) — not by character, not by phrase. Keep verb+complement or
measure-word phrases split into their list words (`一 个 人`, `看 完`). Use Chinese full-width punctuation (，。！？、：“”).
`reading.zh` and chengyu `example.zh` are plain text without spaces.

## Allowed vocabulary

- HSK 1–2: sentences may only use words taught in this unit or earlier units (including all lower levels), plus `extra`.
  The validator enforces this. This is what makes the course work for a true beginner — never use untaught words.
- HSK 3: words from HSK 1–3 lists; prefer words already taught. Unknown words → `extra`.
- HSK 4+, adv: write natural text at the level; words from lists up to your level are fine; anything else should be rare
  and either common enough to be guessable or put in `extra` with a gloss. The validator warns on unknown words —
  keep warnings low (a handful per unit at most).

## Counts and length per unit

| level | sentences | sentence length | dialogue | reading |
|---|---|---|---|---|
| 1 | ≥ 14 | 2–8 tokens | required | — |
| 2 | ≥ 14 | 3–10 tokens | required | optional (≥ 60 chars) |
| 3 | ≥ 14 | 4–12 tokens | optional | required (≥ 100 chars) |
| 4 | ≥ 14 | up to ~14 tokens | optional | required (≥ 150 chars) |
| 5 | ≥ 12 | up to ~16 tokens | optional | required (≥ 250 chars) |
| 6 | ≥ 12 | natural | optional | required (≥ 350 chars) |
| adv | ≥ 12 | natural | optional | required (≥ 400 chars) + `chengyu` |

Mastery level (`adv`) units also have `chengyu`: ≥ 8 entries
`{ "zh": "画蛇添足", "lit": "draw a snake and add feet", "en": "to ruin something by adding unnecessary detail", "example": { "zh": "这句话已经很清楚了，再解释就是画蛇添足。", "en": "..." } }`.
Choose genuinely common chengyu/idioms an educated native uses, no duplicates across units.

## Validate

Run `node build/validate.js build/content/<file>.json` from `/home/user/luxian` after writing, and fix every ERROR
(and as many warnings as reasonable). The file must end with `OK`. Write large files in pieces if needed (e.g. write units
1–5, validate, then add more), but the final file is one JSON document.

## Quality bar

- Native, idiomatic, correct Simplified Chinese. No calques. Correct measure words, correct 了/过/着, correct 的/得/地.
- English translations natural and accurate.
- Content is varied and useful for real life (and, at higher levels, work, news, culture, opinions, abstract topics).
- No offensive or politically charged content. Neutral, friendly tone.
