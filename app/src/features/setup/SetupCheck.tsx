/** Verifies the learning setup on this device: characters, Mandarin voice, microphone, speech checking (on-device model, or the browser's recognizer), and voice pitch range. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkHanziRendering } from '../../lib/fonts';
import { say, ttsSupported, getChosen, getVoices, configureAudio, courseAudioLoaded, courseClipPcm } from '../../lib/audio';
import { getMic, meter, micSupport, recognitionSupported, recognize, recordPitch, recordUtterance, setRecognitionVerified, REC_ERROR_TEXT } from '../../lib/mic';
import { asrSupported, checkSpeech, targetsFor, type Verdict } from '../../lib/asr';
import { useAsr } from '../../lib/asr/useAsr';
import { verdictNote } from '../../lib/asr/feedback';
import { AsrDownload } from './AsrDownload';
import { scoreTranscript, speechPasses } from '../../lib/speechScore';
import { contour, calibrate, median } from '../../lib/pitch';
import { voiceInstallHelp, micPermissionHelp, recognitionHelp, inClaudeViewer } from '../../lib/platform';
import { useProgress } from '../../state/progress';
import { useAudioReady } from '../../state/hooks';
import { Icon } from '../../ui/Icon';
import { Spinner } from '../../ui/Primitives';

type St = 'idle' | 'running' | 'ok' | 'fail' | 'na';
function Step({ n, title, st, children, summary }: { n: number; title: string; st: St; children: ReactNode; summary?: string }) {
  const label = { idle: 'Not checked', running: 'Checking…', ok: 'Working', fail: 'Needs attention', na: 'Not available here' }[st];
  return (
    <section className={'check-step ' + st}>
      <div className="cs-head">
        <span className="cs-num" aria-hidden="true">{st === 'ok' ? <Icon name="check" /> : st === 'fail' ? '!' : n}</span>
        <h3>{title}</h3>
        <span className={'pill ' + st}>{label}</span>
      </div>
      {summary && <p className="small muted">{summary}</p>}
      <div className="cs-body">{children}</div>
    </section>
  );
}

export function SetupCheck({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const setup = useProgress(s => s.setup);
  const update = (patch: Partial<typeof setup>) => useProgress.getState().set(p => { p.setup = { ...p.setup, ...patch, at: Date.now() }; });
  const audioReady = useAudioReady();

  // 1. characters
  const [font, setFont] = useState<St>(setup.font === true ? 'ok' : 'running');
  const [fontDetail, setFontDetail] = useState('');
  useEffect(() => { checkHanziRendering().then(r => { setFontDetail(r.detail); if (!r.ok) { setFont('fail'); update({ font: false }); } else { setFont('ok'); if (!setup.font) update({ font: true }); } }); }, []);

  // 2. sound
  const [tts, setTts] = useState<St>(setup.tts ? 'ok' : setup.tts === false ? 'fail' : 'idle');
  const voices = getVoices();
  // 3. microphone
  const ms = micSupport();
  const [mic, setMic] = useState<St>(ms === 'blocked' || ms === 'unsupported' ? 'na' : setup.mic ? 'ok' : setup.mic === false ? 'fail' : 'idle');
  const [micMsg, setMicMsg] = useState(''); const [level, setLevel] = useState(0);
  const stopMeter = useRef<null | (() => void)>(null);
  useEffect(() => () => stopMeter.current?.(), []);
  async function testMic() {
    setMic('running'); setMicMsg('Allow microphone access if asked, then say something.');
    try {
      await getMic();
      let loudFrames = 0; const t0 = Date.now();
      await new Promise<void>(async resolve => {
        stopMeter.current = await meter(lvl => {
          setLevel(lvl);
          if (lvl > 0.18) loudFrames++;
          if (loudFrames > 12) { stopMeter.current?.(); resolve(); }
          if (Date.now() - t0 > 10000) { stopMeter.current?.(); resolve(); }
        });
      });
      setLevel(0);
      if (loudFrames > 12) { setMic('ok'); setMicMsg('Your microphone hears you clearly.'); update({ mic: true }); }
      else { setMic('fail'); setMicMsg('The microphone works, but I could barely hear you. Move closer, check the input volume, or pick another microphone in your system settings.'); update({ mic: false }); }
    } catch (e: any) {
      const code = e?.code;
      setMic(code === 'blocked' || code === 'unsupported' ? 'na' : 'fail'); update({ mic: false });
      setMicMsg(code === 'denied' ? `Microphone permission is blocked. ${micPermissionHelp()}` : code === 'nodevice' ? 'No microphone was found. Connect one or check your system’s sound input.' : 'The microphone couldn’t be opened.');
    }
  }
  // 4. recognition
  const [rec, setRec] = useState<St>(!recognitionSupported() ? 'na' : setup.rec ? 'ok' : setup.rec === false ? 'fail' : 'idle');
  const [recMsg, setRecMsg] = useState(''); const [heard, setHeard] = useState('');
  async function testRec() {
    setRec('running'); setHeard(''); setRecMsg('Say “你好” (nǐ hǎo) now.');
    const r = await recognize({ onInterim: setHeard, maxMs: 7000 });
    if (r.alternatives.length) {
      const best = Math.max(...r.alternatives.map(a => scoreTranscript('你好', a).score));
      setHeard(r.alternatives[0]);
      const ok = best >= 1 || speechPasses(scoreTranscript('你好', r.alternatives[0]), true);
      if (ok) { setRec('ok'); setRecMsg('Speech recognition understood you.'); update({ rec: true }); setRecognitionVerified(true); }
      else { setRec('fail'); setRecMsg('I heard you, but not “你好”. Try again, speaking a little slower.'); }
    } else {
      const hard = r.error && !['no-speech', 'timeout', 'aborted'].includes(r.error);
      setRec('fail'); if (hard) { update({ rec: false }); setRecognitionVerified(false); }
      setRecMsg(`${REC_ERROR_TEXT[r.error || 'no-speech']} ${hard ? recognitionHelp() : 'Try again and speak right after tapping.'}`);
    }
  }
  // 4b. on-device speech checking (preferred wherever the microphone works)
  const onDevice = asrSupported() && ms !== 'blocked' && ms !== 'unsupported';
  const asr = useAsr();
  const [dev, setDev] = useState<St>(!onDevice ? 'na' : setup.asr ? 'ok' : setup.asr === false ? 'fail' : 'idle');
  const [devMsg, setDevMsg] = useState(''); const [devMarks, setDevMarks] = useState<Verdict[] | null>(null);
  async function testDevice() {
    setDev('running'); setHeard(''); setDevMarks(null); setDevMsg('Say “你好” (nǐ hǎo) now.');
    try {
      const u = await recordUtterance({ silenceMs: 600, maxMs: 6000 });
      if (!u.voiced) { setDev('idle'); setDevMsg('I didn’t hear anything. Tap the button, then say “你好” clearly.'); return; }
      setDevMsg('Checking…');
      const r = await checkSpeech(u.pcm, u.sr, targetsFor('你好', 'nǐ hǎo'), await courseClipPcm('你好'));
      setHeard(r.heard); setDevMarks(r.verdicts);
      if (r.verdicts.every(v => v.mark === 'ok' || v.soft)) { setDev('ok'); setDevMsg('Your pronunciation is checked syllable by syllable, right on this device.'); update({ asr: true, mic: true }); setMic('ok'); }
      else { setDev('fail'); setDevMsg(`${verdictNote(r.verdicts)} Listen to “你好” and try again.`); }
    } catch (e: any) {
      setDev('fail');
      setDevMsg(e?.code === 'denied' ? `Microphone permission is blocked. ${micPermissionHelp()}` : e?.code === 'nodevice' ? 'No microphone was found.' : `Speech checking couldn’t run: ${e?.message || e}`);
    }
  }

  // 5. tone calibration
  const [tone, setTone] = useState<St>(ms === 'blocked' || ms === 'unsupported' ? 'na' : setup.tone ? 'ok' : 'idle');
  const [toneStep, setToneStep] = useState(0); const [toneMsg, setToneMsg] = useState('');
  const TONE_STEPS = [{ ch: '妈', py: 'mā', t: 1, hint: 'high and level' }, { ch: '麻', py: 'má', t: 2, hint: 'rising' }, { ch: '骂', py: 'mà', t: 4, hint: 'falling' }];
  async function recordTone() {
    const s = TONE_STEPS[toneStep];
    setTone('running'); setToneMsg(`Say “${s.py}” (${s.hint}).`);
    try {
      const track = await recordPitch({});
      const c = contour(track);
      if (!c) { setTone('idle'); setToneMsg('I couldn’t hear a clear voice. Speak a little louder and hold the vowel.'); return; }
      useProgress.getState().set(p => { p.voiceCal = calibrate(toneStep === 0 ? { mid: 0, n: 0 } : p.voiceCal, median(track.map(f => f.f)), s.t); });
      if (toneStep + 1 < TONE_STEPS.length) { setToneStep(toneStep + 1); setTone('idle'); setToneMsg('Got it. Next one.'); }
      else { setTone('ok'); setToneMsg('Calibrated to your voice. Tone checking will compare against your own range.'); update({ tone: true }); }
    } catch { setTone('na'); setToneMsg('The microphone isn’t available here.'); }
  }

  const blockedHere = ms === 'blocked';
  return (
    <div className={'setup' + (compact ? ' compact' : '')}>
      <Step n={1} title="Chinese characters" st={font}>
        <div className="font-sample hz" aria-label="Sample characters">你好，欢迎学中文</div>
        <p className="small muted">{fontDetail || 'Checking how characters render…'}</p>
        {font !== 'ok' && font !== 'running' && (
          <div className="row">
            <span className="small">Do you see Chinese characters above, not empty boxes?</span>
            <button className="btn sm" type="button" onClick={() => { setFont('fail'); update({ font: false }); }}>I see boxes</button>
            <button className="btn sm jade" type="button" onClick={() => { setFont('ok'); update({ font: true }); }}>Yes, I can read them</button>
          </div>
        )}
        {font === 'fail' && <p className="small">Characters can’t be displayed on this device. Update your browser, or try Chrome, Edge or Safari. If you use a content blocker, allow fonts for this site.</p>}
      </Step>

      <Step n={2} title="Sound" st={!audioReady ? 'fail' : tts}>
        {audioReady ? (
          <>
            <div className="row">
              <button className="btn sm" type="button" onClick={() => say('你好！很高兴认识你。')}><Icon name="speaker" />Play “你好”</button>
              {!courseAudioLoaded() && voices.length > 1 && (
                <select aria-label="Voice" value={getChosen()?.voiceURI || ''} onChange={e => { configureAudio({ voice: e.target.value }); useProgress.getState().setSettings({ voice: e.target.value }); say('你好！'); }}>
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                </select>
              )}
            </div>
            {tts !== 'ok' && (
              <div className="row">
                <span className="small">Did you hear a Mandarin voice?</span>
                <button className="btn sm" type="button" onClick={() => { setTts('fail'); update({ tts: false }); }}>No</button>
                <button className="btn sm jade" type="button" onClick={() => { setTts('ok'); update({ tts: true }); }}>Yes</button>
              </div>
            )}
            <p className="small muted">{courseAudioLoaded() ? 'You’ll hear the course voice: natural recordings checked for correct tones.' : `Using your device’s voice${getChosen() ? ` (${getChosen()!.name})` : ''}.`}</p>
            {tts === 'fail' && <p className="small">Check that your volume is up. On iPhone, also check the silent switch on the side of the phone.{!courseAudioLoaded() ? ` For a clearer voice: ${voiceInstallHelp()}` : ''}</p>}
          </>
        ) : <p className="small">The course audio couldn’t be loaded and {ttsSupported() ? `no Mandarin voice is installed on this device. Check your connection and reload, or: ${voiceInstallHelp()}` : 'this browser has no speech output. Check your connection and reload.'}</p>}
      </Step>

      <Step n={3} title="Microphone" st={mic}>
        {blockedHere ? <p className="small">{inClaudeViewer() ? 'The Claude viewer doesn’t allow microphone access, so speaking is self-graded here. Open the standalone app in Chrome, Edge or Safari for automatic voice checking.' : 'This page isn’t allowed to use the microphone. Open it directly (not embedded) over HTTPS.'}</p>
          : ms === 'unsupported' ? <p className="small">This browser can’t access a microphone.</p> : (
            <>
              <div className="row">
                <button className="btn sm" type="button" disabled={mic === 'running'} onClick={testMic}><Icon name="mic" />{mic === 'ok' ? 'Test again' : 'Test microphone'}</button>
                {mic === 'running' && <div className="meter" aria-label="Input level"><i style={{ width: Math.round(level * 100) + '%' }} /></div>}
              </div>
              {micMsg && <p className="small">{micMsg}</p>}
            </>
          )}
      </Step>

      {onDevice ? (
        <Step n={4} title="Speech checking" st={dev} summary="Checks every syllable and tone you say. It runs on this device, so it’s private and works offline.">
          {asr.state !== 'ready' ? <AsrDownload /> : (
            <>
              <div className="row">
                <button className="btn sm" type="button" disabled={dev === 'running'} onClick={testDevice}><Icon name="mic" />{dev === 'running' ? 'Listening…' : dev === 'ok' ? 'Test again' : 'Say “你好”'}</button>
                <button className="btn ghost sm" type="button" onClick={() => say('你好！')}><Icon name="speaker" />Hear it</button>
                {dev === 'running' && <Spinner />}
              </div>
              {devMarks && <div className="row"><div className="scorebar">{devMarks.map((v, i) => <span key={i} className={'s ' + v.mark}>{v.ch}</span>)}</div>{heard && <span className="small muted">heard “{heard}”</span>}</div>}
            </>
          )}
          {devMsg && <p className="small">{devMsg}</p>}
        </Step>
      ) : (
        <Step n={4} title="Speech recognition" st={rec} summary="Checks whole words and sentences you say.">
          {rec === 'na' ? <p className="small">{blockedHere ? 'Needs microphone access, which this view doesn’t allow.' : recognitionHelp()}</p> : (
            <>
              <div className="row">
                <button className="btn sm" type="button" disabled={rec === 'running'} onClick={testRec}><Icon name="mic" />{rec === 'running' ? 'Listening…' : rec === 'ok' ? 'Test again' : 'Say “你好”'}</button>
                {rec === 'running' && <Spinner />}
                {heard && <span className="hz heard-inline">“{heard}”</span>}
              </div>
              {recMsg && <p className="small">{recMsg}</p>}
            </>
          )}
        </Step>
      )}

      <Step n={5} title="Tone calibration" st={tone} summary="Three syllables teach the tone checker your voice’s pitch range.">
        {tone === 'na' ? <p className="small">Needs microphone access.</p> : (
          <>
            <div className="row">
              {TONE_STEPS.map((s, i) => <span key={i} className={'cal-chip' + (i < toneStep || tone === 'ok' ? ' done' : i === toneStep ? ' on' : '')}><span className="hz">{s.ch}</span> {s.py}</span>)}
            </div>
            {tone !== 'ok' && <div className="row"><button className="btn sm" type="button" disabled={tone === 'running'} onClick={recordTone}><Icon name="mic" />{tone === 'running' ? 'Listening…' : `Say “${TONE_STEPS[toneStep].py}”`}</button><button className="btn ghost sm" type="button" onClick={() => say(TONE_STEPS[toneStep].ch)}><Icon name="speaker" />Hear it</button></div>}
            {toneMsg && <p className="small">{toneMsg}</p>}
            {tone === 'ok' && <button className="btn ghost sm" type="button" onClick={() => { setToneStep(0); setTone('idle'); setToneMsg(''); }}>Recalibrate</button>}
          </>
        )}
      </Step>
      {onDone && <div className="row end"><button className="btn primary" type="button" onClick={onDone}>Done</button></div>}
    </div>
  );
}
