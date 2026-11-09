/** Extra practice: tone trainer, pinyin chart, drills on studied material, reading room, AI conversation partner. */
import { useEffect, useRef, useState } from 'react';
import type { Item, LevelKey } from '../../lib/types';
import { levels, levelPool, sentenceExercises, tonePracticeItems, nextLesson, LEVEL_META } from '../../lib/course';
import { loadLevel, unitData, sylChar } from '../../lib/data';
import { numToMark } from '../../lib/pinyin';
import { sampleN, sleep } from '../../lib/util';
import { say, ttsAvailable } from '../../lib/audio';
import { micSupport, recognitionSupported, recognize } from '../../lib/mic';
import { useProgress, speakingOn, getProgress } from '../../state/progress';
import { Icon } from '../../ui/Icon';
import { openSheet } from '../../ui/Primitives';
import { toast } from '../../ui/toast';
import { AudioButton } from '../../ui/Hanzi';
import { startSession } from '../player/session';
import { startWeak } from '../path/actions';
import { ReadingView, DialogueView } from '../player/exercises/Cards';

function studiedUnits() {
  const done = getProgress().done; const out: { k: LevelKey; id: string; title: string }[] = [];
  for (const L of levels()) { if (L.key === '0') continue; for (const u of L.units) if (u.lessons.some(l => done[l.id])) out.push({ k: L.key, id: u.id, title: u.title }); }
  return out;
}
async function drill(kind: 'speak' | 'listen' | 'write' | 'build') {
  const su = studiedUnits().slice(-30);
  if (!su.length) { toast('Finish a lesson in HSK 1 first.'); return; }
  startSession({ title: 'Practice', mode: 'practice', load: async () => {
    await Promise.all([...new Set(su.map(x => x.k))].map(k => loadLevel(k)));
    const units = su.map(x => ({ k: x.k, u: unitData(x.k, x.id)! })).filter(x => x.u);
    const sents = units.flatMap(x => x.u.sentences.map(s => ({ s, ...x })));
    const srs = getProgress().srs; const items: Item[] = [];
    if (kind === 'write') units.flatMap(x => x.u.words.filter(w => srs[w]?.s && w.length <= 2).map(w => ({ w, k: x.k }))).sort(() => Math.random() - 0.5).slice(0, 8).forEach(x => items.push({ type: 'write', w: x.w, words: [x.w], level: x.k, review: true }));
    else sampleN(sents, 10).forEach(x => items.push(...sentenceExercises(x.s, x.u, x.k, [kind === 'speak' ? 'speak' : kind === 'listen' ? 'listen_build' : 'build'], levelPool(x.k))));
    return items;
  } });
}
export function PracticeScreen() {
  const ms = micSupport(); const micOk = ms !== 'blocked' && ms !== 'unsupported';
  const tools = [
    { icon: 'wave', title: 'Tone trainer', text: micOk ? 'Hear and say tones; your pitch is drawn and graded.' : 'Hear tones and pick them.', act: () => startSession({ title: 'Tone trainer', mode: 'practice', load: async () => tonePracticeItems(micOk && speakingOn()) }) },
    { icon: 'grid', title: 'Pinyin chart', text: 'Every Mandarin syllable. Tap one to hear its four tones.', act: openChart },
    { icon: 'mic', title: 'Speaking drill', text: recognitionSupported() ? 'Read sentences you know aloud; each one is checked.' : 'Shadow sentences you know.', act: () => drill('speak'), off: !speakingOn() },
    { icon: 'ear', title: 'Listening drill', text: 'Dictation from units you’ve studied.', act: () => drill('listen'), off: !ttsAvailable() },
    { icon: 'pen', title: 'Handwriting', text: 'Write characters you’ve learned; every stroke is checked.', act: () => drill('write') },
    { icon: 'chat', title: 'Sentence builder', text: 'Rebuild sentences from studied units.', act: () => drill('build') },
    { icon: 'book', title: 'Reading room', text: 'Every dialogue and reading you’ve unlocked.', act: openReadingRoom },
    { icon: 'target', title: 'Weak words', text: 'The words you miss most, until they stick.', act: startWeak },
  ];
  return (
    <div className="stack gap-l">
      <div className="section-title"><h2>Practice</h2><span className="small muted">Extra drills on what you’ve learned</span></div>
      <TutorCard />
      <div className="tools">{tools.map(t => (
        <button key={t.title} className={'tool' + (t.off ? ' off' : '')} type="button" onClick={t.act}><span className="ti"><Icon name={t.icon} /></span><h3>{t.title}</h3><p>{t.text}</p></button>
      ))}</div>
    </div>
  );
}
function openChart() {
  openSheet({ title: 'Pinyin chart', wide: true, body: () => <PinyinChart /> });
}
const INITIALS = ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's'];
const FINALS = ['a', 'o', 'e', 'i', 'u', 'ü', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'üe', 'üan', 'ün', 'er'];
const ZERO: Record<string, string> = { i: 'yi', u: 'wu', 'ü': 'yu', ia: 'ya', ie: 'ye', iao: 'yao', iu: 'you', ian: 'yan', in: 'yin', iang: 'yang', ing: 'ying', iong: 'yong', ua: 'wa', uo: 'wo', uai: 'wai', ui: 'wei', uan: 'wan', un: 'wen', uang: 'wang', 'üe': 'yue', 'üan': 'yuan', 'ün': 'yun' };
const spell = (i: string, f: string) => (!i ? ZERO[f] || f : ['j', 'q', 'x'].includes(i) && f.startsWith('ü') ? i + 'u' + f.slice(1) : i + f);
function PinyinChart() {
  const [playing, setPlaying] = useState<string>(''); const [shown, setShown] = useState<{ t: number; s: string; ch: string }[]>([]);
  const play = async (s: string) => { setPlaying(s); const out: typeof shown = []; for (let t = 1; t <= 4; t++) { const ch = sylChar(s, t); if (!ch) continue; out.push({ t, s, ch }); setShown([...out]); await say(ch); await sleep(120); } setPlaying(''); };
  const has = (s: string) => [1, 2, 3, 4].some(t => sylChar(s, t));
  return (
    <div className="stack">
      <div className="chart-out" aria-live="polite">{shown.length ? shown.map(x => <span key={x.t} style={{ color: `var(--t${x.t})` }}><b>{numToMark(x.s + x.t)}</b> <span className="hz">{x.ch}</span></span>) : <span className="muted small">Tap a syllable to hear tones 1–4. Empty cells don’t exist in Mandarin.</span>}</div>
      <div className="pychart"><table><thead><tr><th />{FINALS.map(f => <th key={f} scope="col">{f}</th>)}</tr></thead>
        <tbody>{INITIALS.map(i => <tr key={i}><th scope="row">{i || '∅'}</th>{FINALS.map(f => { const s = spell(i, f); return <td key={f}>{has(s) ? <button type="button" className={playing === s ? 'on' : ''} onClick={() => play(s)}>{s}</button> : null}</td>; })}</tr>)}</tbody></table></div>
    </div>
  );
}
async function openReadingRoom() {
  const su = studiedUnits();
  if (!su.length) { toast('Readings unlock as you study units.'); return; }
  await Promise.all([...new Set(su.map(x => x.k))].map(k => loadLevel(k)));
  openSheet({ title: 'Reading room', wide: true, body: () => (
    <div className="list">{su.slice().reverse().flatMap(x => { const d = unitData(x.k, x.id); return d ? [d.dialogue, d.reading].filter(Boolean).map((src, i) => (
      <button key={x.id + i} className="li" type="button" onClick={() => openSheet({ title: src!.title, wide: true, body: () => ('zh' in src! ? <ReadingView r={src as any} /> : <DialogueView d={src as any} />) })}>
        <div className="grow"><div><b>{src!.title}</b></div><div className="small muted">{LEVEL_META[x.k].name} · {x.title} · {'zh' in src! ? 'Reading' : 'Dialogue'}</div></div><Icon name="chevron" />
      </button>)) : []; })}</div>
  ) });
}

// ---------- AI conversation partner (Claude artifact viewer only) ----------
let tutorProbe: Promise<boolean> | null = null;
function tutorAvailable() {
  if (!tutorProbe) tutorProbe = (async () => { const w = window as any; if (!w.claude?.use) return false; try { return !!(await Promise.race([w.claude.use('sample'), sleep(11000).then(() => null)])); } catch { return false; } })();
  return tutorProbe;
}
const SCENARIOS = [
  { title: 'Ordering at a café', zh: '在咖啡馆' }, { title: 'Meeting a new friend', zh: '认识新朋友' }, { title: 'Shopping and bargaining', zh: '买东西' },
  { title: 'Asking for directions', zh: '问路' }, { title: 'At the doctor', zh: '看病' }, { title: 'Renting an apartment', zh: '租房子' },
  { title: 'Talking about your weekend', zh: '周末' }, { title: 'A job interview', zh: '面试' }, { title: 'Discussing the news', zh: '聊新闻' },
  { title: 'Friendly debate: city or countryside?', zh: '城市还是农村' }, { title: 'Free conversation', zh: '随便聊聊' },
];
function TutorCard() {
  const [avail, setAvail] = useState<boolean | null>(null);
  useEffect(() => { tutorAvailable().then(setAvail); }, []);
  return (
    <section className="card tutor-card">
      <div className="row nowrap"><span className="ti gold"><Icon name="chat" /></span><div className="grow"><h2 className="card-title">Conversation partner</h2><p className="small muted">Role-play real situations at your level. Every message you write gets corrected.</p></div></div>
      {avail === null ? <p className="small muted">Checking availability…</p> : avail
        ? <button className="btn primary" type="button" onClick={pickScenario}>Start a conversation</button>
        : <p className="small muted">The conversation partner runs on Claude, so it’s available when you open the course as a Claude artifact while signed in.</p>}
    </section>
  );
}
function curLevel(): LevelKey { const nl = nextLesson(); return nl ? (nl.level === '0' ? '1' : nl.level) : 'adv'; }
function pickScenario() {
  const lv = curLevel();
  openSheet({ title: 'Choose a situation', body: close => (
    <div className="stack"><p className="small muted">Your partner will speak at about {LEVEL_META[lv].name} level.</p>
      <div className="list">{SCENARIOS.map(sc => <button key={sc.title} className="li" type="button" onClick={() => { close(); setTimeout(() => openChat(sc, lv), 220); }}><span className="lz hz">{sc.zh.slice(0, 2)}</span><div className="grow"><b>{sc.title}</b><div className="small muted hz">{sc.zh}</div></div><Icon name="chevron" /></button>)}</div>
    </div>
  ) });
}
interface Msg { role: 'user' | 'assistant'; text?: string; zh?: string; py?: string; en?: string; fix?: { corrected: string; explanation: string } | null }
function openChat(sc: { title: string; zh: string }, lv: LevelKey) { openSheet({ title: sc.title, wide: true, body: () => <Chat sc={sc} lv={lv} /> }); }
function Chat({ sc, lv }: { sc: { title: string; zh: string }; lv: LevelKey }) {
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null); const meta = LEVEL_META[lv];
  useEffect(() => { ask([]); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs.length, busy]);
  async function ask(history: Msg[]) {
    setBusy(true); setErr('');
    const transcript = history.map(m => (m.role === 'user' ? 'Learner: ' + m.text : 'You: ' + m.zh)).join('\n');
    const prompt = `You are a friendly native Mandarin conversation partner inside a language course. Situation: "${sc.title}" (${sc.zh}). The learner is at ${meta.name} level (${meta.cefr}); use vocabulary and grammar they can follow${lv === '1' || lv === '2' ? ', with short simple sentences' : ''}. Stay in the role-play, reply in 1–3 sentences, and end with a question or prompt so the learner keeps talking. If the learner wrote pinyin or English, reply normally and show the natural Chinese in the correction.\n\nConversation so far:\n${transcript || '(none yet — open the conversation in character)'}\n\nReply with only JSON: {"zh": "your reply in simplified Chinese", "py": "its pinyin with tone marks", "en": "English translation", "fix": null or {"corrected": "the learner's last message rewritten as natural Chinese", "explanation": "one short English sentence on what to change"}}. Use null for fix when the learner's last message was already natural and correct, or when there is no learner message yet.`;
    try {
      const sample = await (window as any).claude.use('sample');
      if (!sample) throw { code: 'not_granted' };
      const r = await sample.json(prompt, { modelTier: 'default', cache: false });
      if (!r || !r.zh) throw new Error('empty');
      const m: Msg = { role: 'assistant', zh: String(r.zh), py: r.py ? String(r.py) : '', en: r.en ? String(r.en) : '', fix: r.fix?.corrected ? r.fix : null };
      setMsgs([...history, m]); say(m.zh!);
    } catch (e: any) {
      setErr(e?.code === 'not_granted' ? 'The conversation partner needs your permission to use Claude. Allow it when asked.' : e?.code === 'rate_limited' ? 'Too many messages at once. Wait a moment, then send again.' : 'Your partner didn’t answer. Send your message again.');
    }
    setBusy(false);
  }
  const send = () => { const t = text.trim(); if (!t || busy) return; const h = [...msgs, { role: 'user' as const, text: t }]; setMsgs(h); setText(''); ask(h); };
  return (
    <div className="chat-wrap">
      <div className="chat">
        {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="msg me hz">{m.text}</div> : (
          <div key={i} className="msg"><div className="hz msg-zh">{m.zh}</div><div className="small muted">{m.py}</div><div className="small">{m.en}</div>
            <div className="row"><AudioButton text={m.zh!} /><AudioButton text={m.zh!} slow /></div>
            {m.fix && <div className="fix"><b>Better: </b><span className="hz">{m.fix.corrected}</span><div>{m.fix.explanation}</div></div>}
          </div>))}
        {busy && <div className="msg typing" aria-label="Typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>
      {err && <p className="small error">{err}</p>}
      <div className="row nowrap chat-input">
        {recognitionSupported() && <button className="iconbtn" type="button" aria-label="Speak your message" onClick={async () => { const r = await recognize({ onInterim: setText }); if (r.alternatives[0]) setText(r.alternatives[0]); }}><Icon name="mic" /></button>}
        <input className="textin hzin" type="text" value={text} placeholder="用中文回答… (pinyin is fine too)" aria-label="Your message" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}
