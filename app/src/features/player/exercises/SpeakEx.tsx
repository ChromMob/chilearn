/** Speaking: sentence/word speech recognition with per-character feedback, and single-syllable tone grading by pitch. */
import { useEffect, useRef, useState } from 'react';
import type { ExProps } from '../types';
import { recognize, abortRecognition, recognitionSupported, recordPitch, recordUtterance, wavUrl, getMic, micSupport, REC_ERROR_TEXT } from '../../../lib/mic';
import { asrSupported, asrState, checkSpeech, loadAsr, targetsFor, toScore, type SylPitch, type Verdict } from '../../../lib/asr';
import { PitchCompare } from '../../../ui/PitchCompare';
import { verdictNote } from '../../../lib/asr/feedback';
import { AsrDownload } from '../../setup/AsrDownload';
import { scoreTranscript, speechPasses, type SpeechScore } from '../../../lib/speechScore';
import { contour, classify, calibrate, TONE_DESC, type Contour } from '../../../lib/pitch';
import { numToMark } from '../../../lib/pinyin';
import { chime, stopSpeech, courseClipPcm } from '../../../lib/audio';
import { useProgress, getProgress } from '../../../state/progress';
import { AudioPair, SentenceView, ToneColored } from '../../../ui/Hanzi';
import { Icon, ToneShape } from '../../../ui/Icon';
import { PitchCanvas } from '../../../ui/PitchCanvas';
import { openSetup } from '../../setup/openSetup';
import { Ex, Title, wordAnswer } from './common';
import { sentAnswer } from './SentenceEx';

const micUsable = () => micSupport() !== 'blocked' && micSupport() !== 'unsupported';
/** device: bundled on-device checker · auto: the browser's recognizer · record: record and self-grade · self: self-grade */
function speechMode(): 'device' | 'auto' | 'record' | 'self' {
  const setup = getProgress().setup;
  if (micUsable() && asrSupported() && (setup.asr || asrState() === 'ready')) return 'device';
  if (recognitionSupported() && setup.rec !== false) return 'auto';
  if (micUsable() && typeof MediaRecorder !== 'undefined') return 'record';
  return 'self';
}
function SelfGrade({ onGrade }: { onGrade: (ok: boolean) => void }) {
  return (
    <div className="row center">
      <button className="btn sm" type="button" onClick={() => onGrade(false)}>Not yet</button>
      <button className="btn jade sm" type="button" onClick={() => onGrade(true)}>I said it right</button>
    </div>
  );
}
function PauseSpeaking({ ctl }: { ctl: ExProps['ctl'] }) {
  return <button className="btn ghost sm" type="button" onClick={() => { useProgress.getState().set(p => { p.speakOffUntil = Date.now() + 15 * 60000; }); ctl.skip('Speaking paused for 15 minutes'); }}><Icon name="skip" />Can’t speak now</button>;
}

export function Speak({ item, ctl, revealed }: ExProps) {
  const s = item.toks ? { t: item.toks, p: item.pys || [], en: item.en || '' } : null;
  const target = item.text!;
  const [mode, setMode] = useState(speechMode);
  const [live, setLive] = useState(false);
  const [heard, setHeard] = useState('');
  const [score, setScore] = useState<SpeechScore | null>(null);
  const [detail, setDetail] = useState<{ v: Verdict[]; pitch?: SylPitch[] } | null>(null);
  const [status, setStatus] = useState('');
  const [tries, setTries] = useState(0);
  const res = useRef<{ ok: boolean; self?: boolean; score?: number; tones?: string[]; note?: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null); const [recUrl, setRecUrl] = useState('');
  const abort = useRef({ aborted: false });
  const asrDismissed = useProgress(p => !!p.dismissed['asr-offer'] || p.setup.asr === false);
  const offerAsr = mode !== 'device' && micUsable() && asrSupported() && !asrDismissed;
  useEffect(() => { if (mode === 'device') loadAsr(); }, [mode]); // warm the model while the learner reads the prompt
  useEffect(() => () => { abort.current.aborted = true; abortRecognition(); if (recorder.current?.state === 'recording') recorder.current.stop(); if (recUrl) URL.revokeObjectURL(recUrl); }, []);
  useEffect(() => {
    ctl.onCheck(() => {
      const r = res.current;
      const tones = r?.tones || [];
      return { ok: !!r?.ok, self: r?.self, answer: s ? sentAnswer(s) : wordAnswer({ zh: target, py: item.py || '', g: item.en || '' }),
        note: r?.note != null ? (r.ok ? (r.note ? `Understood. ${r.note}` : '') : `Matched ${Math.round((r.score || 0) * 100)}%. ${r.note}`) : r?.score != null ? (r.ok ? (tones.length ? `Understood, but check the tone on ${tones.join('、')}.` : '') : `Matched ${Math.round(r.score * 100)}%.` + (tones.length ? ` Tone off on ${tones.join('、')}.` : '')) : '' };
    });
  });
  const grade = (ok: boolean) => { res.current = { ok, self: true }; ctl.submit(); };

  async function listen() {
    if (live) return;
    stopSpeech(); setLive(true); setHeard(''); setStatus('Listening… speak now');
    const r = await recognize({ onInterim: t => setHeard(t) });
    setLive(false);
    if (!r.alternatives.length) {
      if (r.error && ['not-allowed', 'service-not-allowed', 'network', 'unsupported', 'start-failed', 'language-not-supported', 'audio-capture'].includes(r.error)) {
        setStatus(`${REC_ERROR_TEXT[r.error]} You can grade yourself for now.`); setMode(micSupport() === 'granted' && typeof MediaRecorder !== 'undefined' ? 'record' : 'self');
      } else setStatus(r.error === 'no-speech' || r.error === 'timeout' ? 'I didn’t hear anything. Tap the mic and speak clearly.' : 'Something went wrong. Try again.');
      return;
    }
    const n = tries + 1; setTries(n);
    let best: SpeechScore & { text: string } = { score: -1, marks: [], chars: [], text: '' };
    for (const alt of r.alternatives) { const sc = scoreTranscript(target, alt); if (sc.score > best.score) best = { ...sc, text: alt }; }
    setHeard(best.text); setScore(best);
    const tones = best.chars.filter((_, i) => best.marks[i] === 'tone');
    if (speechPasses(best, !!item.isWord)) { res.current = { ok: true, score: best.score, tones }; setStatus(''); ctl.submit(); }
    else if (n >= 2) { res.current = { ok: false, score: best.score, tones }; ctl.ready(true); setStatus('Tap Check to continue, or try once more.'); }
    else { setStatus(`${Math.round(best.score * 100)}% matched.` + (tones.length ? ` Check the tone on ${tones.join('、')}.` : '') + ' Listen to the model and try again.'); chime('bad'); }
  }
  async function listenDevice() {
    if (live) return;
    stopSpeech(); setLive(true); setHeard(''); setStatus('Listening… speak now');
    let u;
    try { u = await recordUtterance({ silenceMs: item.isWord ? 650 : 950, maxMs: item.isWord ? 6000 : 15000, signal: abort.current }); }
    catch { setLive(false); setMode(recognitionSupported() ? 'auto' : 'self'); setStatus('The microphone isn’t available. Say it out loud, then grade yourself.'); return; }
    setLive(false);
    if (abort.current.aborted) return;
    if (!u.voiced) { setStatus('I didn’t hear anything. Tap the microphone and speak clearly.'); return; }
    const url = wavUrl(u.pcm, u.sr); setRecUrl(old => { if (old) URL.revokeObjectURL(old); return url; });
    setStatus('Checking…');
    let r;
    try { r = await checkSpeech(u.pcm, u.sr, targetsFor(target, item.pys || item.py), await courseClipPcm(target)); }
    catch { setMode(recognitionSupported() ? 'auto' : 'record'); setStatus('The speech checker stopped working on this device. Try again with the browser’s recognizer.'); return; }
    if (abort.current.aborted) return;
    const sc = toScore(r.verdicts); setHeard(r.heard); setScore(sc); setDetail({ v: r.verdicts, pitch: r.pitch });
    const n = tries + 1; setTries(n);
    const tones = sc.chars.filter((_, i) => sc.marks[i] === 'tone'); const note = verdictNote(r.verdicts);
    // pass/fail uses the speech model's verdicts; pitch-only tone hints are shown but never fail an answer
    if (speechPasses(toScore(r.verdicts, { hardOnly: true }), !!item.isWord)) { res.current = { ok: true, score: sc.score, tones, note }; setStatus(''); ctl.submit(); }
    else if (n >= 2) { res.current = { ok: false, score: sc.score, tones, note }; ctl.ready(true); setStatus(`${note} Tap Check to continue, or try once more.`); }
    else { setStatus(`${note} Listen to the model and try again.`); chime('bad'); }
  }
  async function toggleRecord() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    try {
      const st = await getMic(); const chunks: Blob[] = [];
      const mr = new MediaRecorder(st); recorder.current = mr;
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => { setLive(false); const url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })); setRecUrl(u => { if (u) URL.revokeObjectURL(u); return url; }); new Audio(url).play().catch(() => {}); setStatus('Compare your recording with the model, then grade yourself.'); };
      mr.start(); setLive(true); setStatus('Recording… tap again to stop');
    } catch { setMode('self'); setStatus('The microphone isn’t available. Say it out loud, then grade yourself.'); }
  }
  return (
    <Ex>
      <Title>Say this out loud</Title>
      {s ? <div className="row"><SentenceView s={s} size="lg" /><AudioPair text={target} /></div>
        : <div className="prompt-word"><ToneColored zh={target} py={item.py} className="pw-hz" /><span className="muted">{item.py}</span><AudioPair text={target} /></div>}
      <div className="trans">{item.en}</div>
      <div className="mic-wrap">
        {mode !== 'self' && !revealed && (
          <button type="button" className={'micbtn' + (live ? ' live' : '')} aria-label={mode === 'auto' || mode === 'device' ? (live ? 'Listening' : 'Start speaking') : (live ? 'Stop recording' : 'Record yourself')} onClick={mode === 'device' ? listenDevice : mode === 'auto' ? listen : toggleRecord}>
            <Icon name={live && mode === 'record' ? 'close' : 'mic'} />
          </button>
        )}
        {(mode === 'auto' || mode === 'device') && <div className="heard" aria-live="polite">{heard ? `“${heard}”` : live ? '' : 'Tap the microphone and read the sentence.'}</div>}
        {score && <div className="scorebar">{score.chars.map((c, i) => <span key={i} className={'s ' + score.marks[i] + (detail?.v[i]?.soft ? ' soft' : '')} title={{ ok: 'correct', tone: detail?.v[i]?.soft ? 'the pitch may be off' : 'check the tone', no: 'missed' }[score.marks[i]]}>{c}</span>)}</div>}
        {detail && mode === 'device' && <PitchCompare v={detail.v} pitch={detail.pitch} />}
        {status && <p className="hint center-text">{status}</p>}
        {mode === 'device' && recUrl && <button className="btn ghost sm" type="button" onClick={() => new Audio(recUrl).play()}><Icon name="play" />Play my recording</button>}
        {offerAsr && !revealed && !live && (
          <div className="asr-offer stack center-text">
            <p className="small muted">Get every syllable and tone checked, privately on this device:</p>
            <AsrDownload onReady={() => { setMode('device'); setStatus(''); }} />
            <button className="btn ghost sm" type="button" onClick={() => useProgress.getState().set(p => { p.dismissed['asr-offer'] = true; })}>Not now</button>
          </div>
        )}
        {mode !== 'auto' && mode !== 'device' && !revealed && (
          <div className="stack center-text">
            {mode === 'self' && <p className="hint">Listen to the model, say it out loud, then grade yourself honestly.</p>}
            {recUrl && <button className="btn ghost sm" type="button" onClick={() => new Audio(recUrl).play()}><Icon name="play" />Play my recording</button>}
            <SelfGrade onGrade={grade} />
            <button className="btn ghost sm" type="button" onClick={openSetup}><Icon name="gear" />Set up automatic checking</button>
          </div>
        )}
      </div>
      {!revealed && <div className="row center"><PauseSpeaking ctl={ctl} /></div>}
    </Ex>
  );
}

export function ToneSpeak({ item, ctl, revealed }: ExProps) {
  const t = item.t!, ch = item.ch!, mark = numToMark(item.base! + t);
  const canMic = micSupport() !== 'blocked' && micSupport() !== 'unsupported' && getProgress().setup.mic !== false;
  const [live, setLive] = useState(false); const [c, setC] = useState<Contour | null>(null);
  const [msg, setMsg] = useState(canMic ? 'Tap the mic and say the syllable.' : 'Listen, repeat it out loud, and grade yourself.');
  const [self, setSelf] = useState(!canMic);
  const tries = useRef(0); const res = useRef<{ ok: boolean; self?: boolean; heard?: number; why?: string } | null>(null);
  const abort = useRef({ aborted: false });
  useEffect(() => () => { abort.current.aborted = true; }, []);
  useEffect(() => { ctl.onCheck(() => ({ ok: !!res.current?.ok, self: res.current?.self, answer: <span><span className="hz">{ch}</span> {mark} — {TONE_DESC[t]}</span>, note: res.current?.heard ? `I heard tone ${res.current.heard} (${res.current.why}).` : '' })); });
  async function rec() {
    if (live) return;
    stopSpeech(); setLive(true); setMsg('Listening…');
    let track;
    try { track = await recordPitch({ signal: abort.current }); }
    catch { setLive(false); setSelf(true); setMsg('The microphone isn’t available. Repeat it out loud and grade yourself.'); return; }
    setLive(false);
    if (abort.current.aborted) return;
    const ct = contour(track); setC(ct);
    const cal = getProgress().voiceCal; const cl = classify(ct, cal);
    if (!cl.tone) { setMsg(cl.why); return; }
    tries.current++;
    if (cl.tone === t) {
      useProgress.getState().set(p => { p.voiceCal = calibrate(p.voiceCal, ct!.medHz, cl.tone); });
      res.current = { ok: true }; setMsg(`Tone ${cl.tone}: ${cl.why}. Nice.`); ctl.submit();
    } else if (tries.current < 2) { setMsg(`That sounded like tone ${cl.tone} (${cl.why}). Tone ${t} is ${TONE_DESC[t]}. Try again.`); chime('bad'); }
    else { res.current = { ok: false, heard: cl.tone, why: cl.why }; ctl.submit(); }
  }
  return (
    <Ex>
      <Title>Say it with the right tone</Title>
      <div className="tone-target">
        <div className="bigword compact"><div className="hz bw-hz">{ch}</div><div className="bw-py" style={{ color: `var(--t${t})` }}>{mark}</div></div>
        <div className="stack center"><ToneShape tone={t} className="tone-shape-lg" /><AudioPair text={ch} /></div>
      </div>
      <PitchCanvas contour={c} target={t} />
      <div className="mic-wrap">
        {!self && !revealed && <button type="button" className={'micbtn' + (live ? ' live' : '')} aria-label="Record" onClick={rec}><Icon name="mic" /></button>}
        <p className="heard" aria-live="polite">{msg}</p>
        {self && !revealed && <SelfGrade onGrade={ok => { res.current = { ok, self: true }; ctl.submit(); }} />}
      </div>
      {!revealed && <div className="row center"><PauseSpeaking ctl={ctl} /></div>}
    </Ex>
  );
}
