/** Profile: stats, activity, settings, setup status, data management. */
import { useState } from 'react';
import { useProgress, streakNow, exportCode, importCode } from '../../state/progress';
import { useAudioReady, useCloudStatus } from '../../state/hooks';
import { getVoices, getChosen, configureAudio, say, courseAudioLoaded } from '../../lib/audio';
import { addDays, dayKey } from '../../lib/util';
import { Icon } from '../../ui/Icon';
import { Segmented, Switch, confirmDialog } from '../../ui/Primitives';
import { toast } from '../../ui/toast';
import { openSetup } from '../setup/openSetup';

export function ProfileScreen() {
  const p = useProgress(); const s = p.settings; const set = p.setSettings;
  const cloud = useCloudStatus(); useAudioReady();
  const learned = Object.values(p.srs).filter(c => c.s).length;
  const lessons = Object.values(p.done).filter(d => !d.skipped).length;
  const totalXp = Object.values(p.days).reduce((a, d) => a + d.xp, 0);
  const today = dayKey(); const startOffset = 83 + new Date().getDay();
  const cells = Array.from({ length: startOffset + 1 }, (_, i) => { const k = addDays(today, i - startOffset); const xp = p.days[k]?.xp || 0; return { k, xp }; });
  const [exp, setExp] = useState(''); const [imp, setImp] = useState<string | null>(null);
  const setupItems = [['Characters', p.setup.font], ['Voice', p.setup.tts], ['Microphone', p.setup.mic], ['Recognition', p.setup.rec], ['Tone calibration', p.setup.tone]] as const;
  const voices = getVoices();
  return (
    <div className="stack gap-l">
      <div className="section-title"><h2>Profile</h2><span className="small muted">{cloud === 'synced' ? 'Synced to your account' : cloud === 'connecting' ? 'Connecting…' : 'Saved on this device'}</span></div>
      <div className="statrow">
        <div className="stat"><span>Streak</span><b className="tnum" style={{ color: 'var(--gold)' }}>{streakNow(p)}</b><span>best {p.streak.best}</span></div>
        <div className="stat"><span>Words</span><b className="tnum" style={{ color: 'var(--jade)' }}>{learned}</b><span>{lessons} lessons</span></div>
        <div className="stat"><span>Total XP</span><b className="tnum" style={{ color: 'var(--accent)' }}>{totalXp}</b><span>{p.totals.items ? Math.round((100 * p.totals.ok) / p.totals.items) : 0}% right</span></div>
      </div>
      <section className="card stack">
        <h2 className="card-title">Last 12 weeks</h2>
        <div className="cal" aria-label="Daily activity">{cells.map(c => <i key={c.k} className={c.xp >= s.goal * 1.5 ? 'l3' : c.xp >= s.goal ? 'l2' : c.xp > 0 ? 'l1' : ''} title={`${c.k}: ${c.xp} XP`} />)}</div>
        <p className="small muted">{p.totals.spoken} items spoken · {p.totals.written} characters written</p>
      </section>
      <section className="card">
        <div className="row between"><h2 className="card-title">Device setup</h2><button className="btn sm" type="button" onClick={openSetup}><Icon name="gear" />Check setup</button></div>
        <div className="setup-pills">{setupItems.map(([label, v]) => <span key={label} className={'pill ' + (v === true ? 'ok' : v === false ? 'fail' : 'idle')}>{v === true ? <Icon name="check" /> : null}{label}</span>)}</div>
      </section>
      <section className="card settings">
        <h2 className="card-title">Learning</h2>
        <Row title="Daily goal" sub="One lesson is about 12–15 XP"><Segmented label="Daily goal" value={s.goal} onChange={v => set({ goal: v })} options={[10, 20, 30, 50, 80].map(v => ({ v, label: `${v}` }))} /></Row>
        <Row title="Show pinyin" sub="“After answering” trains you to read characters"><Segmented label="Show pinyin" value={s.pinyin} onChange={v => set({ pinyin: v })} options={[{ v: 'always', label: 'Always' }, { v: 'hint', label: 'After answering' }, { v: 'never', label: 'Never' }]} /></Row>
        <Row title="Speaking exercises" sub="Say words and sentences out loud"><Switch label="Speaking exercises" checked={s.speaking} onChange={v => { set({ speaking: v }); if (v) useProgress.getState().set(q => { q.speakOffUntil = 0; }); }} /></Row>
        <Row title="Handwriting exercises" sub="Draw characters stroke by stroke"><Switch label="Handwriting exercises" checked={s.writing} onChange={v => set({ writing: v })} /></Row>
        <Row title="Sound effects & vibration"><Switch label="Sound effects" checked={s.sound} onChange={v => { set({ sound: v }); configureAudio({ sound: v }); }} /></Row>
      </section>
      <section className="card settings">
        <h2 className="card-title">Audio</h2>
        <Row title="Voice" sub={courseAudioLoaded() ? 'The course voice is a neural voice recorded for every word and sentence, each clip checked for the right tones.' : 'Course audio couldn’t be loaded, so your device’s voice is used.'}>
          <Segmented label="Voice" value={s.audio || 'course'} onChange={v => { set({ audio: v }); configureAudio({ source: v }); setTimeout(() => say('你好！很高兴认识你。'), 50); }} options={[{ v: 'course', label: 'Course voice' }, { v: 'device', label: 'Device voice' }]} />
        </Row>
        <Row title="Device voice" sub={voices.length ? 'Used for the conversation partner and as a fallback' : 'No Mandarin voice on this device. The course voice still works.'}>
          <select aria-label="Mandarin voice" value={getChosen()?.voiceURI || ''} disabled={!voices.length} onChange={e => { set({ voice: e.target.value }); configureAudio({ voice: e.target.value }); say('你好，很高兴认识你。'); }}>
            {voices.length ? voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>) : <option>None available</option>}
          </select>
        </Row>
        <Row title="Speech speed"><Segmented label="Speech speed" value={s.rate} onChange={v => { set({ rate: v }); configureAudio({ rate: v }); say('我们一起学习中文吧。'); }} options={[{ v: 0.65, label: 'Slow' }, { v: 0.85, label: 'Normal' }, { v: 1, label: 'Native' }]} /></Row>
      </section>
      <section className="card settings">
        <h2 className="card-title">Appearance</h2>
        <Row title="Theme"><Segmented label="Theme" value={s.theme} onChange={v => set({ theme: v })} options={[{ v: '', label: 'System' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} /></Row>
      </section>
      <section className="card stack">
        <h2 className="card-title">Your data</h2>
        <p className="small muted">{cloud === 'synced' ? 'Progress syncs automatically between your devices.' : 'Progress is saved in this browser. Move it to another device with a progress code.'}</p>
        <div className="row">
          <button className="btn sm" type="button" onClick={() => { const c = exportCode(); setExp(c); navigator.clipboard?.writeText(c).then(() => toast('Progress code copied'), () => toast('Select the code and copy it')); }}>Copy progress code</button>
          <button className="btn sm" type="button" onClick={() => setImp('')}>Import a code</button>
          <button className="btn sm danger" type="button" onClick={() => confirmDialog('Reset all progress?', 'This erases every lesson, word and streak on this device and in sync. It can’t be undone.', 'Reset everything', () => { useProgress.getState().reset(); toast('Progress reset'); })}>Reset</button>
        </div>
        {exp && <textarea className="search mono" rows={3} readOnly value={exp} onFocus={e => e.target.select()} aria-label="Progress code" />}
        {imp !== null && <><textarea className="search mono" rows={3} value={imp} placeholder="Paste a progress code" aria-label="Paste progress code" onChange={e => setImp(e.target.value)} />
          <button className="btn sm primary" type="button" onClick={() => { try { importCode(imp); setImp(null); toast('Progress imported and merged'); } catch (e: any) { toast(e.message || 'That code didn’t work'); } }}>Import</button></>}
      </section>
      <p className="small muted credits">Vocabulary: HSK 2.0 lists (complete-hsk-vocabulary, MIT). Characters: LXGW WenKai (SIL OFL). Stroke data: Make Me a Hanzi (Arphic Public License) via Hanzi Writer. Course voice: Kokoro-82M v1.1-zh (Apache 2.0), every clip checked by speech recognition and pitch tracking. Speech checking: Zipformer CTC Chinese model (k2-fsa icefall / sherpa-onnx) running on your device with ONNX Runtime Web (MIT).</p>
    </div>
  );
}
function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <div className="setting"><div className="grow"><b>{title}</b>{sub && <div className="small muted">{sub}</div>}</div>{children}</div>;
}
