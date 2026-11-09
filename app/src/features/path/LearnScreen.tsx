/** Home: what to do next, today's plan, and the course path. */
import { useEffect, useRef, useState } from 'react';
import type { Lesson, Level, Unit } from '../../lib/types';
import { levels, nextLesson, unitOf, levelOf, unitProgress, levelProgress } from '../../lib/course';
import { loadLevel, unitData, word } from '../../lib/data';
import { dayKey } from '../../lib/util';
import { useProgress, dueCount, todayStat } from '../../state/progress';
import { useNow } from '../../state/hooks';
import { Icon } from '../../ui/Icon';
import { Ring, openSheet, Banner, Spinner } from '../../ui/Primitives';
import { AudioButton, SentenceView, ToneColored } from '../../ui/Hanzi';
import { startLesson, startReview, testOutLevel, testOutUnit } from './actions';
import { openSetup } from '../setup/openSetup';
import { micSupport } from '../../lib/mic';

const KIND_ICON: Record<string, string> = { grammar: 'bulb', sentences: 'chat', story: 'book', chengyu: 'star', 'p-tones-say': 'mic', 'p-sounds-type': 'keyboard', test: 'trophy', 'p-test': 'star' };
const KIND_TEXT: Record<string, string> = {
  words: 'Meet new words, then practise them: meaning, sound, tones, pinyin and a few sentences.',
  grammar: 'Read a short grammar note, then use the pattern in sentences.', sentences: 'Build, hear, translate and say full sentences from this unit.',
  story: 'Read or listen to a short text, then answer questions about it.', chengyu: 'Learn idioms with their stories and use them in context.',
  test: 'A mixed test of the whole unit. Score 80% to complete it.', 'p-tones-intro': 'Hear the four tones and learn to tell them apart.',
  'p-tones-ear': 'Train your ear on tones across many syllables.', 'p-tones-say': 'Say each tone; your pitch is drawn and graded.',
  'p-sounds-ear': 'Hear similar syllables and pick the one you heard.', 'p-sounds-type': 'Write the pinyin of what you hear, tones included.',
  'p-pairs': 'Mark the tones of real two-syllable words.', 'p-sandhi': 'Learn how tones change in 你好, 不是 and 一个.', 'p-test': 'A short checkpoint on this unit’s sounds. Score 80% to pass.',
};

export function LearnScreen() {
  const done = useProgress(s => s.done);
  useProgress(s => s.srs); useNow();
  const nl = nextLesson(done);
  return (
    <div className="stack gap-l">
      <NextUp nl={nl} />
      <TodayPlan nl={nl} />
      <SetupNudge />
      <div className="section-title"><h2>Your path</h2><span className="small muted">Pinyin → HSK 1–6 → Mastery</span></div>
      {levels().map((L, i) => <Stage key={L.key} L={L} index={i} nl={nl} />)}
    </div>
  );
}

function NextUp({ nl }: { nl: Lesson | null }) {
  const due = dueCount();
  const anyDone = Object.keys(useProgress.getState().done).length > 0;
  if (due >= 15 || (!nl && due)) return (
    <section className="nextup">
      <div className="nu-hz" aria-hidden="true">温</div>
      <div className="eyebrow">Next up</div>
      <h2>Review {Math.min(due, 20)} words</h2>
      <p>Reviews keep words from fading. Clear them, then continue your path.</p>
      <button className="btn invert" type="button" onClick={() => startReview()}><Icon name="review" />Start review</button>
    </section>
  );
  if (!nl) {
    const pending = levels().some(l => l.pending);
    return <section className="nextup"><div className="eyebrow">{pending ? 'All available lessons done' : 'Course complete'}</div><h2>你太棒了！</h2><p>Keep your reviews going and use the conversation partner to stay sharp.</p></section>;
  }
  const L = levelOf(nl.level), u = unitOf(nl);
  const p = unitProgress(u);
  return (
    <section className="nextup">
      <div className="nu-hz" aria-hidden="true">{u.titleZh?.[0] || '学'}</div>
      <div className="eyebrow">Next up · {L.name} · Unit: {u.title}</div>
      <h2>{nl.title}</h2>
      <p>{u.goal}</p>
      <div className="nu-row">
        <button className="btn invert" type="button" onClick={() => startLesson(nl)}><Icon name="play" />{anyDone ? 'Continue' : 'Start learning'}</button>
        <span className="nu-meta tnum">Lesson {p.done + 1} of {p.total} in this unit</span>
      </div>
    </section>
  );
}

function TodayPlan({ nl }: { nl: Lesson | null }) {
  const goal = useProgress(s => s.settings.goal); const t = todayStat(); const due = dueCount();
  const done = useProgress(s => s.done);
  const lessonsToday = Object.values(done).filter(d => d.at && !d.skipped && dayKey(new Date(d.at)) === dayKey()).length;
  const items = [
    { done: due === 0, label: due ? `Review ${due} due word${due > 1 ? 's' : ''}` : 'Reviews cleared', meta: due ? `~${Math.max(1, Math.ceil(Math.min(due, 20) * 0.15))} min` : '', act: () => startReview() },
    { done: lessonsToday >= 1, keep: true, label: nl ? `Next lesson: ${nl.title} · ${unitOf(nl).title}` : 'All lessons done', meta: lessonsToday ? `${lessonsToday} today` : '~4 min', act: () => nl && startLesson(nl) },
    { done: t.xp >= goal, label: 'Reach your daily goal', meta: `${t.xp}/${goal} XP`, act: () => (due ? startReview() : nl && startLesson(nl)) },
  ];
  const pct = Math.min(100, Math.round((100 * t.xp) / goal));
  return (
    <section className="stack">
      <div className="section-title"><h2>Today</h2><span className="small muted tnum">{pct}% of daily goal</span></div>
      <div className="goalbar" role="progressbar" aria-valuenow={t.xp} aria-valuemax={goal} aria-label="Daily goal"><i style={{ width: pct + '%' }} /></div>
      <div className="plan">
        {items.map((it, i) => (
          <button key={i} className={'plan-item' + (it.done ? ' done' : '') + (it.keep ? ' keep' : '')} type="button" onClick={it.act}>
            <span className="tick"><Icon name="check" /></span><span className="lbl">{it.label}</span><span className="meta tnum">{it.meta}</span><Icon name="chevron" className="chev" />
          </button>
        ))}
      </div>
    </section>
  );
}
function SetupNudge() {
  const setup = useProgress(s => s.setup); const dismissed = useProgress(s => s.dismissed.setup);
  if (dismissed || setup.at) return null;
  return (
    <Banner icon="mic">
      <p><b>Check your setup.</b> Make sure audio, your microphone and speech recognition work before speaking exercises start.</p>
      <div className="row"><button className="btn sm primary" type="button" onClick={openSetup}>Run the check</button><button className="btn ghost sm" type="button" onClick={() => useProgress.getState().set(p => { p.dismissed.setup = true; })}>Later</button></div>
    </Banner>
  );
}

function Stage({ L, index, nl }: { L: Level; index: number; nl: Lesson | null }) {
  const done = useProgress(s => s.done);
  const isCur = nl?.level === L.key;
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? isCur;
  if (L.pending) return <section className="stage"><div className="stage-head pending"><div className="num hz">{L.hz}</div><div><div className="eyebrow">Stage {index} · {L.name}</div><h3>{L.title}</h3><div className="sub">Coming soon.</div></div></div></section>;
  const p = levelProgress(L, done); const pct = Math.round((100 * p.done) / Math.max(1, p.total));
  const firstPos = L.units[0]?.lessons[0]?.pos ?? 0;
  const ahead = nl ? firstPos > nl.pos : false;
  return (
    <section className="stage">
      <button className={'stage-head' + (isCur ? ' current' : '') + (p.done === p.total ? ' done' : '')} type="button" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <div className="num hz">{L.hz}</div>
        <div className="sh-text"><div className="eyebrow">Stage {index} · {L.name} · {L.cefr}</div><h3>{L.title}</h3><div className="sub">{L.blurb}</div></div>
        <Ring pct={pct} />
      </button>
      {isOpen && (
        <div className="stage-body">
          {ahead && L.key !== '0' && (
            <Banner icon="trophy"><p>Already know {L.name}? Pass a 20-question test with 80% to unlock this stage.</p><button className="btn sm primary" type="button" onClick={() => testOutLevel(L)}>Test out of {L.name}</button></Banner>
          )}
          {L.units.map(u => <UnitCard key={u.id} u={u} nl={nl} />)}
        </div>
      )}
    </section>
  );
}

function UnitCard({ u, nl }: { u: Unit; nl: Lesson | null }) {
  const done = useProgress(s => s.done);
  const p = unitProgress(u, done); const complete = p.done === p.total;
  const current = nl?.unitId === u.id;
  const locked = !complete && !current && (nl ? u.lessons[0].pos > nl.pos : false);
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? current;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (current && ref.current && !(window as any).__scrolledToCurrent) { (window as any).__scrolledToCurrent = true; setTimeout(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150); } }, []);
  return (
    <div ref={ref} className={'unit' + (current ? ' current' : '') + (complete ? ' complete' : '') + (locked ? ' locked' : '')}>
      <button className="unit-head" type="button" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <div className="uz hz">{u.titleZh}</div>
        <div className="grow"><h4>{u.title}</h4><p>{u.goal}</p>
          <div className="ubar" aria-hidden="true"><i style={{ width: (100 * p.done) / p.total + '%' }} /></div></div>
        <span className="u-state">{complete ? <span className="pill ok"><Icon name="check" />Done</span> : locked ? <Icon name="lock" /> : <span className="small muted tnum">{p.done}/{p.total}</span>}</span>
        <Icon name="chevronDown" className={'chev' + (isOpen ? ' up' : '')} />
      </button>
      {isOpen && (
        <div className="unit-body">
          {u.level !== '0' && <button className="btn ghost sm guide-btn" type="button" onClick={() => openGuide(u)}><Icon name="book" />Unit guide: words & grammar</button>}
          <ol className="nodes">
            {u.lessons.map((l, i) => {
              const isDone = !!done[l.id]; const isNext = nl?.id === l.id; const unlocked = isDone || (nl ? l.pos <= nl.pos : true);
              return (
                <li key={l.id} className="node-wrap" style={{ ['--dx' as any]: `${[0, 36, 60, 36, 0, -36, -60, -36][i % 8]}px` }}>
                  <button type="button" className={'node' + (isDone ? ' done' : isNext ? ' current' : unlocked ? '' : ' locked') + (l.test ? ' test' : '')} aria-label={`${l.title}${isDone ? ', completed' : isNext ? ', up next' : unlocked ? '' : ', locked'}`}
                    onClick={() => (unlocked ? openLesson(l) : testOutUnit(l))}>
                    <Icon name={isDone && !l.test ? 'check' : unlocked ? KIND_ICON[l.kind] || (l.level === '0' ? 'ear' : 'play') : 'lock'} />
                    {isNext && <span className="node-flag">Start</span>}
                  </button>
                  <div className="node-label">{l.title}<small>{isDone ? `Best ${useProgress.getState().done[l.id]?.best ?? ''}%` : l.sub}</small></div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function openLesson(l: Lesson) {
  const u = unitOf(l); const d = useProgress.getState().done[l.id];
  openSheet({ title: l.title, body: () => <LessonPreview l={l} />, footer: close => (
    <>
      <button className="btn" type="button" onClick={close}>Not now</button>
      <button className="btn primary" type="button" onClick={() => { close(); setTimeout(() => startLesson(l), 180); }}>{d ? 'Practise again' : 'Start'}</button>
    </>
  ) });
}
function LessonPreview({ l }: { l: Lesson }) {
  const u = unitOf(l); const L = levelOf(l.level); const d = useProgress.getState().done[l.id];
  const [words, setWords] = useState<string[] | null>(null);
  useEffect(() => { if (l.kind === 'words') loadLevel(l.level).then(() => { const ud = unitData(l.level, u.id); if (ud) setWords(ud.words.slice(l.idx! * l.batch!, l.idx! * l.batch! + l.batch!)); }); }, []);
  return (
    <div className="stack">
      <div className="eyebrow">{L.name} · {u.title}</div>
      <p>{KIND_TEXT[l.kind]}</p>
      {words && <div className="chips">{words.map(w => <span key={w} className="chip hz">{w}</span>)}</div>}
      {d && <p className="small muted">Completed{d.best ? ` · best score ${d.best}%` : ''}. Practising again refreshes these words.</p>}
      {(l.kind === 'p-tones-say') && micSupport() === 'blocked' && <p className="small muted">This view can’t use the microphone, so you’ll grade your own speaking.</p>}
    </div>
  );
}
export function openGuide(u: Unit) {
  openSheet({ title: `${u.titleZh} · ${u.title}`, wide: true, body: () => <UnitGuide u={u} /> });
}
function UnitGuide({ u }: { u: Unit }) {
  const [ud, setUd] = useState(() => unitData(u.level, u.id));
  useEffect(() => { if (!ud) loadLevel(u.level).then(() => setUd(unitData(u.level, u.id))); }, []);
  if (!ud) return <div className="loading"><Spinner /></div>;
  return (
    <div className="stack gap-l">
      <p className="muted">{u.goal}</p>
      {ud.grammar.length > 0 && (
        <section className="stack"><h3>Grammar</h3>
          {ud.grammar.map((g, i) => (
            <div key={i} className="notecard"><h4>{g.title}</h4><div className="pattern hz">{g.pattern}</div><p>{g.explain}</p>
              {g.examples.slice(0, 3).map((e, j) => <div key={j} className="exline"><div className="grow"><SentenceView s={e} /><div className="trans">{e.en}</div></div><AudioButton text={e.t.join('')} /></div>)}</div>
          ))}
        </section>
      )}
      <section className="stack"><h3>Words ({ud.words.length})</h3>
        <div className="list">{ud.words.map(w => <GuideWord key={w} zh={w} level={u.level} />)}</div>
      </section>
    </div>
  );
}
function GuideWord({ zh }: { zh: string; level: string }) {
  const w = word(zh); if (!w) return null;
  return <div className="li static"><ToneColored zh={w.zh} py={w.py} className="lz" /><div className="grow"><div><b>{w.py}</b></div><div className="small muted">{w.g}</div></div><AudioButton text={w.zh} /></div>;
}
