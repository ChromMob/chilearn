// End-to-end tests against the production build (vite preview). Uses the pre-installed Playwright + Chromium.
// Fake microphone audio and a scripted speech recognizer let speaking flows run unattended.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = path.resolve('.'); const SHOTS = path.join(ROOT, 'tests/e2e/shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4173, BASE = `http://localhost:${PORT}/`;
const results = []; const only = process.argv[2];
const log = (...a) => console.log(...a);

const INIT = `
  (() => {
    const v = { name: 'Test Mandarin', lang: 'zh-CN', voiceURI: 'test-zh', localService: true, default: false };
    const ss = window.speechSynthesis;
    if (ss) { ss.getVoices = () => [v]; ss.speak = u => setTimeout(() => u.onend && u.onend(), 25); ss.cancel = () => {}; Object.defineProperty(ss, 'speaking', { get: () => false }); }
    window.__srAnswer = null;
    class FakeSR { start() { setTimeout(() => { const t = window.__srAnswer ?? '你好'; if (t === '__nospeech') { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return; } const res = [{ transcript: t, confidence: 0.9 }]; res.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [res] }); this.onend && this.onend(); }, 350); } stop() {} abort() {} }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  })();`;

async function launch(audio = 'voice.wav') {
  return chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.join(ROOT, 'tests/e2e/audio', audio)}`, '--autoplay-policy=no-user-gesture-required'] });
}
async function newPage(browser, { mobile = true, dark = false, seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 860 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light', hasTouch: mobile, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(sw|manifest)/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(INIT);
  if (seed) await page.addInitScript(s => { try { localStorage.setItem('luxian.v2', s); } catch (e) {} }, JSON.stringify(seed));
  return { ctx, page, errors };
}
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); log(`✔ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); log(`✘ ${name}: ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Automated learner: answers the current exercise correctly (or wrongly with probability `wrong`). Returns a short description. */
async function solveStep(page, wrong = 0) {
  const st = await page.evaluate(() => ({ item: window.__lxItem, inst: window.__lxInst, phase: window.__lxPhase, done: !!document.querySelector('.result') }));
  if (st.done) return 'done';
  if (!st.item || st.phase !== 'answer') { await page.waitForTimeout(120); return 'wait'; }
  // wait until the outgoing exercise has animated away and only the current one is on screen
  await page.waitForFunction(id => { const w = document.querySelectorAll('.ex-wrap'); return w.length === 1 && w[0].getAttribute('data-inst') === String(id); }, st.inst, { timeout: 5000 });
  const it = st.item; const body = page.locator('.player-body');
  const foot = page.locator('.player-foot');
  const miss = Math.random() < wrong;
  const clickOpt = async i => { const opts = body.locator('.opts .opt'); const n = await opts.count(); await opts.nth(miss ? (i + 1) % n : i).click(); };
  const W = it.wobj || await page.evaluate(w => { const x = window.__lxWord?.(w); return x; }, it.w);
  if (it.intro) { await foot.getByRole('button', { name: 'Continue' }).click(); return 'card:' + it.type; }
  switch (it.type) {
    case 'mc_meaning': case 'mc_hanzi': case 'listen_pick': await clickOpt(it.options.findIndex(o => o.zh === it.w)); break;
    case 'mc_translate': await clickOpt(it.options.indexOf(it.s.en)); break;
    case 'fill': await clickOpt(it.options.indexOf(it.s.t[it.idx])); break;
    case 'question': await clickOpt(it.q.answer); break;
    case 'mc_chengyu': case 'fill_chengyu': await clickOpt(it.options.findIndex(o => o.zh === it.c.zh)); break;
    case 'pin_pick': await clickOpt(it.options.indexOf(it.base)); break;
    case 'sandhi': await clickOpt(it.options.indexOf(it.it.said)); break;
    case 'pin_tone_listen': await body.locator('.tones.four .tonebtn').nth(miss ? (it.t % 4) : it.t - 1).click(); break;
    case 'tones': {
      const py = it.wobj ? it.wobj.py : (await page.evaluate(w => window.__lxWord(w).py, it.w));
      const tones = await page.evaluate(p => window.__lxParse(p).map(s => s.tone), py);
      const rows = body.locator('.tone-row');
      for (let i = 0; i < tones.length; i++) await rows.nth(i).locator('.tonebtn').nth(tones[i] - 1).click();
      break;
    }
    case 'type_pinyin': { const py = await page.evaluate(w => window.__lxWord(w).py, it.w); await body.locator('input.textin').fill(miss ? 'xxx' : py); break; }
    case 'pin_type': await body.locator('input.textin').fill(it.base + it.t); break;
    case 'build': case 'listen_build': {
      const toks = it.s.t.filter(t => !/^[\p{P}\p{S}]+$/u.test(t));
      for (const t of toks) { const tile = body.locator('.bank .tile:not(.used)').filter({ has: page.locator('.c', { hasText: new RegExp('^' + t + '$') }) }).first(); await tile.click(); }
      break;
    }
    case 'match': {
      for (const p of it.pairs) {
        await body.locator('.match .hzopt').filter({ has: page.locator('.c', { hasText: new RegExp('^' + p.zh + '$') }) }).click();
        await body.locator('.match .opt:not(.hzopt)').filter({ hasText: p.g }).first().click();
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(500); break;
    }
    case 'speak': {
      await page.evaluate(([t, m]) => { window.__srAnswer = m ? '对不起' : t; }, [it.text, miss]);
      const mic = body.locator('.micbtn');
      if (await mic.count()) { await mic.click(); if (miss) { await page.waitForTimeout(700); await mic.click(); } }
      else await body.getByRole('button', { name: 'I said it right' }).click();
      await page.waitForFunction(() => window.__lxPhase !== 'answer', null, { timeout: 8000 }).catch(() => {});
      if (await page.evaluate(() => window.__lxPhase === 'answer')) { const chk = foot.getByRole('button', { name: 'Check' }); if (await chk.isEnabled()) await chk.click(); }
      break;
    }
    case 'tone_speak': {
      const mic = body.locator('.micbtn');
      if (await mic.count()) {
        for (let k = 0; k < 2 && (await page.evaluate(() => window.__lxPhase)) === 'answer'; k++) { await mic.click(); await page.waitForFunction(() => !document.querySelector('.micbtn.live'), null, { timeout: 9000 }); await page.waitForTimeout(150); }
      } else await body.getByRole('button', { name: 'I said it right' }).click();
      break;
    }
    case 'write': await body.getByRole('button', { name: 'Skip writing' }).click(); return 'write-skip';
    default: return 'UNKNOWN:' + it.type;
  }
  await page.waitForTimeout(60);
  if (await page.evaluate(() => window.__lxPhase === 'answer')) {
    const chk = foot.getByRole('button', { name: 'Check' });
    if (await chk.count() && await chk.isEnabled()) await chk.click();
  }
  await page.waitForFunction(() => window.__lxPhase !== 'answer', null, { timeout: 5000 }).catch(() => {});
  const ok = await foot.evaluate(el => el.classList.contains('ok') ? 'ok' : el.classList.contains('bad') ? 'bad' : 'none');
  const label = it.type + ':' + ok + (it.type === 'tone_speak' ? `(t${it.t})` : '');
  const cont = foot.getByRole('button', { name: 'Continue' });
  if (await cont.count()) await cont.click();
  return label;
}
async function runSession(page, { wrong = 0, max = 160 } = {}) {
  const steps = [];
  for (let i = 0; i < max; i++) { const r = await solveStep(page, wrong); if (r === 'wait') continue; steps.push(r); if (r === 'done') break; }
  const res = await page.evaluate(() => ({ title: document.querySelector('.result h2')?.textContent, stats: [...document.querySelectorAll('.result .stat b')].map(b => b.textContent) }));
  return { steps, ...res };
}
async function finishSession(page) { await page.locator('.player-foot').getByRole('button', { name: /Back to path|Continue/ }).last().click(); await page.waitForTimeout(250); }

// ---------- server ----------
function waitForServer() { return new Promise((res, rej) => { const t0 = Date.now(); const tick = () => http.get(BASE, r => { r.resume(); res(); }).on('error', () => (Date.now() - t0 > 20000 ? rej(new Error('server did not start')) : setTimeout(tick, 300))); tick(); }); }
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await waitForServer();

// expose two tiny helpers for the solver (lookup words and parse pinyin) by reading the app's own data
const HELPERS = `window.__lxWord = w => window.__lxWords && window.__lxWords[w]; window.__lxParse = p => p.toLowerCase().normalize('NFC').split(/\\s+/).filter(Boolean).map(s => { const M = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ'; let tone = 5; for (const ch of s) { const i = M.indexOf(ch); if (i >= 0) tone = (i % 4) + 1; } return { tone }; });`;

try {
  // 1. Onboarding with the full setup check (fonts, voice, mic, recognition, calibration), then lesson 1.
  await test('onboarding + verified setup check (phone)', async () => {
    const b = await launch('nihao.wav'); const { page, errors } = await newPage(b);
    await page.addInitScript(HELPERS);
    await page.goto(BASE); await page.getByText('I’m new to Mandarin').click();
    await page.screenshot({ path: path.join(SHOTS, '01-goal.png') });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForSelector('.check-step');
    await page.waitForFunction(() => document.querySelector('.check-step')?.classList.contains('ok'), null, { timeout: 8000 });
    const fontInfo = await page.evaluate(() => ({ bundled: document.fonts.check('40px "Lu Kai"', '你'), detail: document.querySelector('.check-step .small')?.textContent }));
    expect(fontInfo.bundled, 'bundled Chinese font did not load'); 
    const steps = page.locator('.check-step');
    await steps.nth(1).getByRole('button', { name: /Play/ }).click();
    await page.waitForFunction(() => window.__lxLastAudio, null, { timeout: 8000 });
    const src = await page.evaluate(() => window.__lxLastAudio);
    expect(src === 'course', 'expected the bundled course voice to play, got: ' + src);
    await steps.nth(1).getByRole('button', { name: 'Yes' }).click();
    await steps.nth(2).getByRole('button', { name: /Test microphone/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.check-step')[2].classList.contains('ok') || document.querySelectorAll('.check-step')[2].classList.contains('fail'), null, { timeout: 15000 });
    expect(await steps.nth(2).evaluate(e => e.classList.contains('ok')), 'microphone step failed: ' + await steps.nth(2).innerText());
    // on-device speech checking: download the bundled model, then say 你好 (the fake microphone plays a real recording)
    await steps.nth(3).getByRole('button', { name: /Download speech checker/ }).click();
    await steps.nth(3).getByRole('button', { name: /Say “你好”/ }).waitFor({ timeout: 90000 });
    await steps.nth(3).getByRole('button', { name: /Say “你好”/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.check-step')[3].classList.contains('ok') || document.querySelectorAll('.check-step')[3].classList.contains('fail'), null, { timeout: 20000 });
    expect(await steps.nth(3).evaluate(e => e.classList.contains('ok')), 'speech checking step failed: ' + await steps.nth(3).innerText());
    for (let k = 0; k < 3; k++) { await steps.nth(4).getByRole('button', { name: /Say “/ }).click(); await page.waitForFunction(() => !document.querySelectorAll('.check-step')[4].classList.contains('running'), null, { timeout: 12000 }); }
    expect(await steps.nth(4).evaluate(e => e.classList.contains('ok')), 'tone calibration failed: ' + await steps.nth(4).innerText());
    await page.screenshot({ path: path.join(SHOTS, '02-setup-check.png'), fullPage: true });
    await page.getByRole('button', { name: 'Start lesson 1' }).click();
    await page.waitForSelector('.player'); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, '03-lesson1.png') });
    const s = await runSession(page);
    expect(s.title === 'Lesson complete', 'lesson 1 did not complete: ' + JSON.stringify(s));
    await page.screenshot({ path: path.join(SHOTS, '04-result.png') });
    await finishSession(page);
    await page.screenshot({ path: path.join(SHOTS, '05-learn.png') });
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });

  // 1b. Course audio: a lesson word plays from the bundled verified clips, at normal and slow speed (pitch-preserving).
  await test('bundled course audio plays (normal and slow)', async () => {
    const b = await launch('voice.wav');
    const seed = { v: 2, onboarded: true, updatedAt: 1, settings: { goal: 30, pinyin: 'always', rate: 0.85, voice: '', speaking: true, writing: true, sound: false, theme: '', audio: 'course' }, done: {}, srs: {}, days: {}, streak: { cur: 0, best: 0, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0, totals: { lessons: 0, items: 0, ok: 0, spoken: 0, written: 0 }, setup: { at: 1 }, dismissed: { setup: true } };
    const { page, errors } = await newPage(b, { mobile: false, seed });
    await page.goto(BASE); await page.waitForSelector('.nextup');
    await page.locator('.nextup .btn').first().click(); await page.waitForSelector('.player');
    await page.waitForFunction(() => window.__lxItem?.type === 'pin_intro', null, { timeout: 8000 });
    await page.locator('.syl').first().click();
    await page.waitForFunction(() => window.__lxLastAudioOk === true, null, { timeout: 8000 });
    expect(await page.evaluate(() => window.__lxLastAudio) === 'course', 'syllable did not use course audio');
    await page.evaluate(() => { window.__lxLastAudioOk = undefined; });
    await page.locator('.player-foot').getByRole('button', { name: 'Continue' }).click();
    await page.waitForFunction(() => window.__lxItem?.type === 'pin_tone_listen', null, { timeout: 8000 });
    await page.locator('.player-body .audio').nth(1).click(); // slow
    await page.waitForFunction(() => window.__lxLastAudioOk === true, null, { timeout: 10000 });
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });

  // 1c. On-device speech checking catches mistakes: wrong syllable through the microphone, and wrong tone / wrong
  //     syllable recordings run through the real worker and model.
  await test('on-device checker flags a wrong syllable (setup check, microphone)', async () => {
    const b = await launch('nizao.wav');
    const seed = { v: 2, onboarded: true, updatedAt: 1, settings: { goal: 30, pinyin: 'always', rate: 0.85, voice: '', speaking: true, writing: true, sound: false, theme: '' }, done: {}, srs: {}, days: {}, streak: { cur: 0, best: 0, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0, totals: { lessons: 0, items: 0, ok: 0, spoken: 0, written: 0 }, setup: { at: 1, mic: true }, dismissed: { setup: true } };
    const { page, errors } = await newPage(b, { mobile: false, seed });
    await page.goto(BASE + '#profile'); await page.getByRole('button', { name: 'Check setup' }).click();
    const step = page.locator('.check-step').nth(3);
    await step.getByRole('button', { name: /Download speech checker/ }).click();
    await step.getByRole('button', { name: /Say “你好”/ }).waitFor({ timeout: 90000 });
    await step.getByRole('button', { name: /Say “你好”/ }).click();
    await page.waitForFunction(() => { const e = document.querySelectorAll('.check-step')[3]; return e.classList.contains('ok') || e.classList.contains('fail'); }, null, { timeout: 20000 });
    const txt = await step.innerText();
    expect(await step.evaluate(e => e.classList.contains('fail')) && /好/.test(txt), 'expected 你早 to fail the 你好 check, got: ' + txt);
    await page.screenshot({ path: path.join(SHOTS, '06-asr-wrong.png') });
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });
  await test('on-device checker: tone and syllable errors (worker + model)', async () => {
    const b = await launch('voice.wav'); const { page, errors } = await newPage(b, { mobile: false });
    await page.goto(BASE); await page.waitForFunction(() => window.__lxAsrApi, null, { timeout: 8000 });
    const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/asr/cases.json'), 'utf8'));
    const pcm = k => Array.from(new Float32Array(new Uint8Array(fs.readFileSync(path.join(ROOT, `tests/fixtures/asr/${k}.pcm.bin`))).buffer));
    const r = await page.evaluate(async ([cases, pcms]) => {
      const api = window.__lxAsrApi; if (!(await api.loadAsr())) return { error: 'load failed' };
      const T = { 想想: [{ ch: '想', base: 'xiang', tone: 3 }, { ch: '想', base: 'xiang', tone: 3 }], 报名: [{ ch: '报', base: 'bao', tone: 4 }, { ch: '名', base: 'ming', tone: 2 }] };
      const out = [];
      for (let k = 0; k < cases.length; k++) { const v = (await api.checkSpeech(new Float32Array(pcms[k]), 16000, T[cases[k].target])).verdicts; out.push({ label: cases[k].label, pos: cases[k].pos, marks: v.map(x => x.mark) }); }
      return out;
    }, [fx, fx.map((_, k) => pcm(k))]);
    expect(Array.isArray(r), JSON.stringify(r));
    for (const c of r) expect(c.label === 'ok' ? c.marks.every(m => m === 'ok') : c.marks[c.pos] === c.label, 'unexpected verdicts: ' + JSON.stringify(c));
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });
  await test('speaking exercise checked on device (word, microphone)', async () => {
    const b = await launch('nihao.wav');
    const seed = { v: 2, onboarded: true, updatedAt: 1, settings: { goal: 30, pinyin: 'always', rate: 0.85, voice: '', speaking: true, writing: true, sound: false, theme: '' }, done: {}, srs: {}, days: {}, streak: { cur: 0, best: 0, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0, totals: { lessons: 0, items: 0, ok: 0, spoken: 0, written: 0 }, setup: { at: 1, mic: true, asr: true }, dismissed: { setup: true } };
    const { page, errors } = await newPage(b, { seed });
    await page.goto(BASE); await page.waitForSelector('.nextup');
    await page.evaluate(() => window.__lxAsrApi.loadAsr());
    await page.evaluate(() => window.__lxStartSession({ title: 'Speaking test', mode: 'practice', load: async () => [{ type: 'speak', text: '你好', py: 'nǐ hǎo', en: 'hello', words: [], level: '1', isWord: true }] }));
    await page.waitForFunction(() => window.__lxItem?.type === 'speak', null, { timeout: 10000 });
    await page.locator('.player-body .micbtn').click();
    await page.waitForFunction(() => window.__lxPhase !== 'answer', null, { timeout: 20000 });
    const foot = await page.locator('.player-foot').evaluate(e => e.className);
    await page.screenshot({ path: path.join(SHOTS, '07-asr-speak.png') });
    expect(/\bok\b/.test(foot), 'speaking item was not accepted: ' + foot + ' / ' + await page.locator('.player-body').innerText());
    expect(await page.locator('.pitch-cmp').count() > 0, 'pitch comparison not shown');
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });

  // 2. Tone speaking through the real microphone pipeline, one synthetic voice per tone.
  for (const tone of [1, 2, 3, 4]) await test(`tone grading via microphone: tone ${tone}`, async () => {
    const b = await launch(`tone${tone}.wav`);
    const seed = { v: 2, onboarded: true, updatedAt: 1, settings: { goal: 30, pinyin: 'always', rate: 0.85, voice: '', speaking: true, writing: true, sound: false, theme: '' }, done: {}, srs: {}, days: {}, streak: { cur: 0, best: 0, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0, totals: { lessons: 0, items: 0, ok: 0, spoken: 0, written: 0 }, setup: { mic: true, at: 1 }, dismissed: { setup: true } };
    const { page, errors } = await newPage(b, { seed });
    await page.addInitScript(HELPERS);
    await page.goto(BASE + '#practice'); await page.getByRole('button', { name: /Tone trainer/ }).click();
    await page.waitForSelector('.player');
    let graded = 0, correct = 0; const wrongs = [];
    for (let i = 0; i < 60; i++) {
      const it = await page.evaluate(() => window.__lxItem);
      if (await page.locator('.result').count()) break;
      if (!it) { await page.waitForTimeout(100); continue; }
      const r = await solveStep(page);
      if (r.startsWith('tone_speak')) { graded++; const ok = r.includes(':ok'); const expectOk = it.t === tone; if (ok === expectOk) correct++; else wrongs.push(`${r} (audio tone ${tone})`); }
    }
    if (graded === 0) throw new Error('no tone-speaking items were presented');
    await page.screenshot({ path: path.join(SHOTS, `06-tone${tone}.png`) });
    expect(correct === graded, `tone ${tone}: ${correct}/${graded} judged as expected. ${wrongs.join('; ')}`);
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });

  // 3. Skip the pinyin stage via the UI, then complete HSK 1 unit 1 (all lesson types and the unit test).
  await test('HSK 1 unit 1 end to end, desktop', async () => {
    const b = await launch('voice.wav');
    const seed = { v: 2, onboarded: true, updatedAt: 1, settings: { goal: 30, pinyin: 'always', rate: 0.85, voice: '', speaking: true, writing: true, sound: false, theme: '' }, done: {}, srs: {}, days: {}, streak: { cur: 0, best: 0, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0, totals: { lessons: 0, items: 0, ok: 0, spoken: 0, written: 0 }, setup: { at: 1, mic: true, rec: true }, dismissed: { setup: true } };
    const { page, errors } = await newPage(b, { mobile: false, seed });
    await page.addInitScript(HELPERS);
    await page.goto(BASE);
    await page.locator('.unit').nth(1).locator('.unit-head').click();
    await page.locator('.unit').nth(1).locator('.node').first().click();
    await page.getByRole('button', { name: 'Skip to HSK 1' }).click();
    await page.waitForFunction(() => document.querySelector('.nextup')?.textContent.includes('HSK 1'), null, { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '07-desktop-learn.png') });
    const summary = [];
    for (let k = 0; k < 12; k++) {
      const label = await page.locator('.nextup h2').textContent();
      if (!/New words|Grammar|Sentences|Dialogue|Reading|Unit test/.test(label)) break;
      await page.locator('.nextup .btn').first().click();
      await page.waitForSelector('.player');
      if (k === 1) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, '08-desktop-exercise.png') }); }
      const s = await runSession(page, { wrong: label === 'Unit test' ? 0 : 0.08 });
      summary.push(`${label}: ${s.title} ${s.stats.join(' ')}`);
      const bad = s.steps.filter(x => /UNKNOWN|:none/.test(x));
      expect(!bad.length, `${label} had unanswerable steps: ${bad.join(', ')}`);
      expect(s.title && !/Not quite/.test(s.title), `${label} failed: ${s.title}`);
      await finishSession(page);
      if (label === 'Unit test') break;
    }
    log('   ' + summary.join('\n   '));
    expect(summary.some(s => s.startsWith('Unit test')), 'never reached the unit test');
    const unitDone = await page.locator('.unit').filter({ hasText: 'Hello' }).first().locator('.pill.ok').count();
    expect(unitDone === 1, 'unit 1 not marked complete');
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });

  // 4. Inside an embedded frame without microphone permission (like the Claude viewer): graceful fallback.
  await test('embedded without microphone: self-graded fallback', async () => {
    const frameSrv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<!doctype html><body style="margin:0"><iframe src="${BASE}" style="border:0;width:100vw;height:100vh" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`); }).listen(4180);
    const b = await launch('voice.wav'); const { page, errors } = await newPage(b);
    await page.goto('http://127.0.0.1:4180/');
    const f = page.frameLocator('iframe');
    await f.getByText('I’m new to Mandarin').click(); await f.getByRole('button', { name: 'Continue' }).click();
    await f.locator('.check-step').nth(2).waitFor();
    const micState = await f.locator('.check-step').nth(2).locator('.pill').textContent();
    const recState = await f.locator('.check-step').nth(3).locator('.pill').textContent();
    await page.screenshot({ path: path.join(SHOTS, '09-embedded-setup.png'), fullPage: true });
    expect(/Not available/.test(micState) && /Not available/.test(recState), `expected mic/recognition unavailable, got ${micState} / ${recState}`);
    expect(!errors.length, errors.join('\n'));
    await b.close(); frameSrv.close();
  });

  // 5. Reviews, practice, words, profile on phone in dark mode, with a seeded learner.
  await test('review session + other screens (phone, dark)', async () => {
    const b = await launch('voice.wav');
    const srs = {}; const now = Date.now();
    for (const w of ['你', '好', '你好', '谢谢', '再见', '我', '是', '不', '很', '对不起', '没关系', '老师']) srs[w] = { l: '1', i: 2, e: 250, d: now - 1000, n: 2, x: 1, s: true };
    const seed = { v: 2, onboarded: true, updatedAt: 1, settings: { goal: 30, pinyin: 'hint', rate: 0.85, voice: '', speaking: true, writing: true, sound: false, theme: '' }, done: { 'p1-a': { best: 90, n: 1, at: now } }, srs, days: {}, streak: { cur: 3, best: 5, last: '' }, voiceCal: { mid: 0, n: 0 }, speakOffUntil: 0, totals: { lessons: 1, items: 10, ok: 9, spoken: 0, written: 0 }, setup: { at: 1, mic: true, rec: true, font: true, tts: true }, dismissed: {} };
    const { page, errors } = await newPage(b, { dark: true, seed });
    await page.addInitScript(HELPERS);
    await page.goto(BASE + '#review');
    await page.screenshot({ path: path.join(SHOTS, '10-review-dark.png') });
    await page.locator('.nextup .btn').first().click(); await page.waitForSelector('.player');
    // words must be loaded for the solver
    await page.evaluate(async () => { const r = await fetch('./data/L1.json').then(r => r.json()); window.__lxWords = Object.fromEntries(Object.entries(r.words).map(([zh, a]) => [zh, { zh, py: a[0], g: a[1] }])); });
    const s = await runSession(page, { wrong: 0.1 });
    expect(s.title === 'Review complete', 'review did not complete: ' + s.title);
    await finishSession(page);
    const due = await page.evaluate(() => document.querySelector('.nextup h2')?.textContent);
    log('   after review: ' + due);
    for (const r of ['practice', 'words', 'profile']) { await page.goto(BASE + '#' + r); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, `11-${r}-dark.png`), fullPage: r === 'profile' }); }
    expect(!errors.length, errors.join('\n'));
    await b.close();
  });
} finally {
  server.kill();
}
const failed = results.filter(r => !r.ok);
log(`\n${results.length - failed.length}/${results.length} e2e tests passed`);
process.exit(failed.length ? 1 : 0);
