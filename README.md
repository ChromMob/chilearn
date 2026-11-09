# Lùxiàn Mandarin

A guided Mandarin course from the first tone to native-level reading: pinyin and tones → HSK 1–6 → a mastery stage
(idioms, register, native texts). 1,209 lessons, ~6,200 words, ~5,300 sentences. Every answer is checked automatically:
multiple choice, tile or keyboard sentence building, typed pinyin with tones, dictation, comprehension, speech
(speech recognition with per-character tone feedback), single-syllable tones (pitch tracking against your calibrated
voice range) and handwriting (stroke by stroke).

## Project layout

| Path | What it is |
|---|---|
| `app/` | The web app: React 18 + TypeScript + Vite, installable PWA, works offline after first use |
| `app/src/lib/` | Framework-free logic: pinyin grading, spaced repetition, speech scoring, pitch/tone analysis, course generation |
| `app/src/features/` | Screens: onboarding, setup check, path, lesson player + exercises, review, practice, words, profile |
| `app/tests/unit/` | Vitest: grading, SRS, speech, pitch, sync merge, content integrity, every lesson builds valid exercises |
| `app/tests/e2e/` | Playwright: onboarding + device check, tone grading through a fake microphone, a full unit, embedded fallback, review |
| `build/` | Content pipeline: vocabulary extraction, content validator, compiler (`compile.js` → `app/public/data`) |
| `build/content/*.json` | Course text: units, grammar, sentences, dialogues, readings, idioms |
| `build/audio/` | Course audio generation and verification (Kokoro TTS, two recognisers, WORLD tone resynthesis) |
| `build/asr/` | On-device speech checker: Python reference, evaluation, export of the model and lookup tables |

## Develop and test

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run build        # type-check + production build → dist/ (and dist-artifact/ for the Claude viewer)
npm run e2e          # end-to-end tests against the production build
```

## Deploying (needed for automatic voice checking)

Browsers only allow the microphone and speech recognition on a real HTTPS site that isn’t embedded in another page.
Host `app/dist/` on any static host and open it in Chrome, Edge or Safari:

- **Netlify Drop**: drag the `dist` folder onto https://app.netlify.com/drop.
- **GitHub Pages / Cloudflare Pages / Vercel**: deploy `app/dist` as a static site (no server needed).

Inside the Claude artifact viewer the microphone is blocked; the app detects this and switches speaking items to
listen-and-repeat with self-grading, and the setup check explains why.

## Speech checking (on device)

Speaking is checked by a bundled Mandarin speech model (zipformer CTC, int8, 63 MB in `app/public/asr/`) running in a
Web Worker with ONNX Runtime Web: private, works offline after a one-time download, and the same in every modern
browser (Chrome, Edge, Safari 16.4+, Firefox). It replaces the browser's speech recognition where it can.

A free transcript is a poor judge of pronunciation: recognisers "correct" towards the word you meant. So instead,
`src/lib/asr/ctc.ts` scores the expected text against rivals for every syllable (the same syllable with other tones,
similar sounds such as zh/z/j or an/ang, and leaving it out) and marks each syllable ok / tone / missed. Tone sandhi
(一, 不, 3-3) is allowed for. On top of that, `tones.ts` compares each syllable's pitch line with the course recording
and the textbook tone shapes; that is shown as a hint (with your pitch drawn against the course voice) and never fails
an answer on its own. Single-syllable tone drills keep using the calibrated pitch tracker.

Measured on 150 recordings with known mistakes (`build/asr/`): 73 of 75 correct words pass; 40 of 40 wrong syllables
are caught; 32 of 35 tone errors spoken as a different syllable (e.g. báo for bào) are caught; missing syllables and
unrelated speech were flagged in every case tried. A tone error made with pitch alone, where the word is still obvious
from context, is the hard case: the speech model catches about a quarter, and with the pitch hint about half (with the
hint also appearing on about 7% of correctly spoken words, which is why it never fails an answer). These numbers come
from synthetic voices; real learners' accents and microphones will differ.

Rebuild the assets with `python3 build/asr/export.py` (model path in `build/asr/ctc.py`). The TypeScript feature
extraction, scores and transcripts are tested against the Python reference (`tests/unit/asr.test.ts`). The model is
left out of the Claude-viewer build, which can't use the microphone.

## Course audio

All ~16,500 spoken strings (words, sentences, dialogue lines, reading sentences, idioms, every pinyin syllable) are
pre-generated with an open-source neural voice and shipped as one MP3 pack per unit (`app/public/audio/`). Each clip is
checked before it ships:

- sentences and words: speech recognition must hear the same tone-marked pinyin (homophones allowed, tone errors not);
  failing clips are regenerated with other takes (speed, phrasing);
- a second pass (`repair.py`) re-checks every failure with a second, independent recogniser (Paraformer), ignores
  characters that sound the same in context (的/得/地, 他/她/它), and then tries other takes and other Kokoro voices of
  the same gender; clips that still never pass are flagged so the app uses the device voice for them instead;
- single syllables (tone drills, one-character words; `syllables.py` + `citation.py`): the neural voice says an isolated
  syllable with almost no tone movement and often adds a faint breath after it. Each syllable is cut to its own voicing,
  its vowel is lengthened per tone (3rd longest, 4th shortest) and it gets a wide textbook contour (1st high and level,
  2nd rising about 7 semitones, 3rd dipping low then rising, 4th falling about 12 semitones) with Praat’s overlap-add
  resynthesis, which adds no vocoder noise. The app’s own pitch tracker must read back the intended tone (1,863 of
  1,863 do);
- clearer tones for words and sentences (`clarify.py`): the neural voice’s pitch movement is natural but small (median
  2.8 semitones per syllable; only about half of syllables match their tone’s shape), so each syllable is located
  (speech-model alignment plus the consonant’s energy dip) and its pitch is pulled to the textbook contour of its tone
  after sandhi (3-3, 一, 不; non-final 3rd tones as half-thirds; neutral tones left alone). A clip keeps the clearest
  version that both recognisers still hear exactly right (full strength, else 0.7, else unchanged). On a test set this
  raised tone-shape matches from 59% to 94% for words and from 52% to 85% for sentences.

Current build: 16,431 of 16,537 clips (99.4%) verified; 13,257 of 14,674 word and sentence clips (90%) carry the
clearer tones, the rest stay as recorded because the stronger version was no longer heard exactly right.

Regenerate with `build/audio/collect.js` → `gen.py` → `repair.py` → `clarify_all.py` → `syllables.py` → `pack.py` (all resumable;
`chain.sh` and `chain2.sh` run them in order).

## Content changes

```bash
cd build
node validate.js content/hsk3.json   # check one level
node compile.js                      # regenerate app/public/data
```

## Credits

Vocabulary: complete-hsk-vocabulary (MIT). Chinese font: LXGW WenKai (SIL OFL 1.1), subset to the course’s 3,082
characters. Stroke data: Make Me a Hanzi via hanzi-writer-data (Arphic Public License); stroke checking: Hanzi Writer
(MIT). Pinyin generation: pinyin-pro (MIT). Speech checking: zipformer CTC Chinese model from k2-fsa
(icefall / sherpa-onnx, small int8 2025-07-16; check its license terms before commercial use), run with ONNX Runtime
Web (MIT). Course voice: Kokoro-82M v1.1-zh (Apache 2.0) run offline with sherpa-onnx;
verification with SenseVoice and Paraformer speech recognition (build time only, not shipped); word and sentence tones reshaped with the WORLD vocoder (pyworld); single-syllable tones with Praat via praat-parselmouth.
