/** Full-screen session runner: queue, re-queue of mistakes, scoring, XP and review scheduling. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Item } from '../../lib/types';
import { shuffle, prefersReducedMotion } from '../../lib/util';
import { chime, buzz, say, stopSpeech } from '../../lib/audio';
import { word } from '../../lib/data';
import { nextLesson } from '../../lib/course';
import { useProgress, getProgress, speakingOn } from '../../state/progress';
import { Icon } from '../../ui/Icon';
import { Spinner, confirmDialog, anySheetOpen } from '../../ui/Primitives';
import { toast } from '../../ui/toast';
import { EXERCISES } from './exercises';
import type { CheckResult, ExCtl, SessionOpts, SessionResult } from './types';
import { useSession } from './session';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { startLesson } from '../path/actions';

type Phase = 'loading' | 'error' | 'answer' | 'feedback' | 'done';
interface Inst { item: Item; id: number }

export function Player({ opts }: { opts: SessionOpts }) {
  const end = useSession(s => s.end);
  const store = useProgress;
  const [phase, setPhase] = useState<Phase>('loading');
  const [inst, setInst] = useState<Inst | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, n: 0, total: 0 });
  const [final, setFinal] = useState<SessionResult | null>(null);
  const [appealed, setAppealed] = useState(false);
  const q = useRef<Item[]>([]);
  const stats = useRef({ graded: 0, firstOk: 0, ok: 0, words: new Map<string, { level: string; grade: number; mistake: boolean }>(), start: Date.now(), selfGraded: 0, missed: [] as Item[] });
  const requeued = useRef(new Set<Item>());
  const doneCount = useRef(0), total = useRef(0), maxPct = useRef(0), idSeq = useRef(0);
  const checkFn = useRef<(() => CheckResult) | null>(null);
  const optionsRef = useRef<{ n: number; choose: (i: number) => void } | null>(null);
  const phaseRef = useRef<Phase>('loading'); phaseRef.current = phase;
  const instRef = useRef<Inst | null>(null); instRef.current = inst;
  const againRef = useRef<Item | null>(null);
  const isTest = opts.mode === 'test' || opts.mode === 'placement';
  const rootRef = useRef<HTMLDivElement>(null);

  const updateProgress = useCallback((answering: boolean) => {
    const remaining = q.current.length + (answering ? 1 : 0);
    const pct = Math.round((100 * doneCount.current) / Math.max(1, doneCount.current + remaining));
    maxPct.current = Math.max(maxPct.current, pct);
    setProgress({ pct: maxPct.current, n: Math.min(doneCount.current + 1, total.current), total: total.current });
  }, []);

  const show = useCallback(() => {
    stopSpeech();
    checkFn.current = null; optionsRef.current = null;
    let next = q.current.shift();
    while (next && (next.type === 'speak' || next.type === 'tone_speak') && !speakingOn()) { total.current--; next = q.current.shift(); }
    if (!next) { finish(); return; }
    setResult(null); setReady(false); setAppealed(false);
    setInst({ item: next, id: ++idSeq.current });
    setPhase('answer');
    updateProgress(true);
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const items = (await opts.load()).filter(it => it && EXERCISES[it.type]);
      if (!items.length) { toast('Nothing to practise here yet.'); close(); return; }
      q.current = items.slice(); total.current = items.length; doneCount.current = 0;
      show();
    } catch (e) { console.error(e); setPhase('error'); }
  }, []);
  useEffect(() => { load(); return () => stopSpeech(); }, []);

  // keep the footer above the on-screen keyboard
  useEffect(() => {
    const vv = window.visualViewport; const el = rootRef.current; if (!vv || !el) return;
    const fit = () => { el.style.height = vv.height + 'px'; el.style.top = vv.offsetTop + 'px'; };
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    document.documentElement.classList.add('player-open');
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); document.documentElement.classList.remove('player-open'); };
  }, []);

  function record(item: Item, grade: number, mistake: boolean, overwrite = false) {
    for (const w of item.words || []) {
      const prev = stats.current.words.get(w);
      stats.current.words.set(w, overwrite || !prev ? { level: item.level, grade, mistake } : { level: item.level, grade: Math.min(prev.grade, grade), mistake: prev.mistake || mistake });
    }
  }
  const check = useCallback((giveUp = false) => {
    const cur = instRef.current; if (phaseRef.current !== 'answer' || !cur) return;
    const item = cur.item;
    let res: CheckResult = { ok: false };
    try { res = checkFn.current ? checkFn.current() : { ok: false }; } catch (e) { console.error(e); }
    if (giveUp) res = { ...res, ok: false, grade: 0, note: '', canAppeal: false, given: null };
    const ok = !!res.ok; const firstTry = !requeued.current.has(item);
    const st = stats.current;
    if (firstTry) { st.graded++; if (ok) st.firstOk++; }
    if (ok) st.ok++;
    if (res.self) st.selfGraded++;
    const P = store.getState();
    P.countItem(ok);
    if (ok && (item.type === 'speak' || item.type === 'tone_speak')) P.set(p => { p.totals.spoken++; });
    if (ok && item.type === 'write') P.set(p => { p.totals.written++; });
    const grade = ok ? (res.grade ?? 2) : res.grade === 1 ? 1 : 0;
    record(item, grade, !ok);
    if (opts.mode === 'review' && item.review) for (const w of item.words || []) P.review(w, item.level, grade as 0 | 1 | 2);
    chime(ok ? 'ok' : 'bad'); if (!ok) buzz();
    againRef.current = null;
    if (!ok && !isTest && firstTry && !item.noRequeue) {
      const again: Item = { ...item, options: item.options ? shuffle(item.options) : item.options };
      requeued.current.add(again); q.current.push(again); total.current++; againRef.current = again;
    }
    if (!ok && item.words?.length) st.missed.push(item);
    setResult(res); setPhase('feedback');
    updateProgress(false);
    const sayText = res.say ?? (item.s ? item.s.t.join('') : item.w || item.text || item.ch || '');
    if (!ok && !giveUp && sayText && item.type !== 'listen_build') setTimeout(() => { if (instRef.current === cur && phaseRef.current === 'feedback') say(sayText); }, 320);
  }, []);
  const appeal = () => {
    const cur = instRef.current; if (!cur || phaseRef.current !== 'feedback' || !result) return;
    const item = cur.item; const st = stats.current;
    const again = againRef.current;
    if (again) { const i = q.current.indexOf(again); if (i >= 0) { q.current.splice(i, 1); total.current--; } }
    if (!requeued.current.has(item)) st.firstOk++;
    st.ok++;
    const m = st.missed.indexOf(item); if (m >= 0) st.missed.splice(m, 1);
    record(item, 2, false, true);
    if (opts.mode === 'review' && item.review) for (const w of item.words || []) store.getState().review(w, item.level, 2);
    result.onAppeal?.();
    setAppealed(true); chime('ok'); updateProgress(false);
  };
  const advance = useCallback(() => {
    const cur = instRef.current;
    if (phaseRef.current === 'feedback' || (phaseRef.current === 'answer' && cur?.item.intro)) { phaseRef.current = 'loading'; doneCount.current++; show(); }
  }, []);

  const ctlFor = useCallback((id: number): ExCtl => ({
    ready: v => { if (instRef.current?.id === id && phaseRef.current === 'answer') setReady(v); },
    submit: () => { if (instRef.current?.id === id) check(); },
    skip: msg => { if (instRef.current?.id === id && phaseRef.current === 'answer') { if (msg) toast(msg); total.current = Math.max(doneCount.current, total.current - 1); show(); } },
    onCheck: fn => { if (instRef.current?.id === id) checkFn.current = fn; },
    onOptions: (n, choose) => { if (instRef.current?.id === id) optionsRef.current = { n, choose }; },
  }), []);

  function finish() {
    const st = stats.current;
    const acc = st.graded ? st.firstOk / st.graded : 1;
    const pass = opts.passMark ? acc >= opts.passMark : true;
    let xp = opts.mode === 'lesson' ? 10 + Math.round(acc * 5) : opts.mode === 'test' ? (pass ? 15 + Math.round(acc * 5) : 3) : opts.mode === 'review' ? st.ok + 5 : Math.max(1, st.ok);
    if (opts.mode === 'placement') xp = 5;
    const P = store.getState();
    if (opts.mode === 'lesson' || (opts.mode === 'test' && pass)) {
      for (const [w, g] of st.words) {
        const c = getProgress().srs[w];
        if (!c || !c.s) P.learn(w, g.level, g.mistake);
        else if (c.d <= Date.now()) P.review(w, g.level, g.mistake ? 1 : 2);
        else if (g.mistake) P.review(w, g.level, 1);
      }
    }
    if (opts.mode === 'practice') for (const [w, g] of st.words) { const c = getProgress().srs[w]; if (c?.s && g.mistake) P.review(w, g.level, 0); }
    if (pass && opts.lessonId) P.markDone(opts.lessonId, Math.round(acc * 100));
    const { goalReached, streak } = P.addXp(xp);
    if (goalReached) setTimeout(() => toast(`Daily goal reached · ${streak}-day streak`), 900);
    chime(pass ? 'done' : 'bad');
    setFinal({ acc, pass, xp, secs: Math.round((Date.now() - st.start) / 1000), words: st.words.size, selfGraded: st.selfGraded });
    setInst(null); setPhase('done'); setProgress(p => ({ ...p, pct: 100 }));
  }
  function close(r: SessionResult | null = null) { stopSpeech(); end(); opts.onDone?.(r); }
  function quit() {
    if (phaseRef.current === 'done') return close(final);
    if (phaseRef.current === 'loading' || phaseRef.current === 'error') return close(null);
    confirmDialog('Quit this session?', 'Your answers in this session won’t be saved.', 'Quit', () => { stopSpeech(); end(); (opts.onExit || (() => opts.onDone?.(null)))(); });
  }

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || anySheetOpen()) return;
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if (e.key === 'Enter') {
        if (e.repeat || (tag === 'button' && !typing)) return;
        e.preventDefault();
        const ph = phaseRef.current;
        if (ph === 'answer') { if (instRef.current?.item.intro) advance(); else if (checkReady.current) check(); }
        else if (ph === 'feedback') advance();
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') { quit(); return; }
      if (phaseRef.current === 'answer' && optionsRef.current && /^[1-9]$/.test(e.key)) { const i = Number(e.key) - 1; if (i < optionsRef.current.n) optionsRef.current.choose(i); }
      if (e.key === ' ' && tag !== 'button') { const b = rootRef.current?.querySelector<HTMLButtonElement>('.player-body .audio'); if (b) { e.preventDefault(); b.click(); } }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const checkReady = useRef(false); checkReady.current = ready;

  useEffect(() => { (window as any).__lxItem = inst?.item ?? null; (window as any).__lxInst = inst?.id ?? 0; (window as any).__lxPhase = phase; }, [inst, phase]);
  const Ex = inst ? EXERCISES[inst.item.type] : null;
  const ok = !!result?.ok || appealed;
  const reduce = prefersReducedMotion();
  const nl = nextLesson();
  return (
    <div className="player" ref={rootRef} role="dialog" aria-modal="true" aria-label={opts.title}>
      <div className="player-top">
        <button className="iconbtn" type="button" aria-label="Quit" onClick={quit}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} aria-label="Session progress"><i style={{ width: progress.pct + '%' }} /></div>
        <span className="small muted tnum player-count">{phase === 'answer' || phase === 'feedback' ? `${progress.n}/${progress.total}` : ''}</span>
      </div>
      <div className="player-body">
        {phase === 'loading' && <div className="loading"><Spinner /><p className="muted">Loading…</p></div>}
        {phase === 'error' && (
          <div className="loading">
            <p>This lesson couldn’t be loaded. Check your connection and try again.</p>
            <div className="row center"><button className="btn" type="button" onClick={() => close()}>Close</button><button className="btn primary" type="button" onClick={load}>Try again</button></div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {inst && Ex && (
            <motion.div key={inst.id} data-inst={inst.id} className="ex-wrap" initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
              <ErrorBoundary fallback={() => <div className="loading"><p>This exercise couldn’t be shown.</p><button className="btn primary" type="button" onClick={() => ctlFor(inst.id).skip()}>Skip it</button></div>}>
                <Ex item={inst.item} ctl={ctlFor(inst.id)} revealed={phase === 'feedback'} result={result} />
              </ErrorBoundary>
            </motion.div>
          )}
          {phase === 'done' && final && (
            <motion.div key="result" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <Results r={final} opts={opts} missed={stats.current.missed} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className={'player-foot' + (phase === 'feedback' ? ' show ' + (ok ? 'ok' : 'bad') : '')}>
        <div className="foot-inner">
          {phase === 'answer' && inst && (inst.item.intro
            ? <><span /><button className="btn primary" type="button" onClick={advance}>Continue</button></>
            : <><button className="btn ghost" type="button" onClick={() => check(true)}>{isTest ? 'I don’t know' : 'Skip'}</button><button className="btn primary" type="button" disabled={!ready} onClick={() => check()}>Check</button></>)}
          {phase === 'feedback' && result && (
            <>
              <div className="feedback">
                <h3><span className="fb-icon"><Icon name={ok ? 'check' : 'close'} /></span>{appealed ? 'Accepted' : ok ? praise(inst?.id || 0) : result.grade === 1 ? 'Almost' : 'Correct answer:'}</h3>
                {result.answer && <div className="ans">{result.answer}</div>}
                {!ok && result.given && <div className="small given">You answered: <span className="hz">{result.given}</span></div>}
                {result.note && <div className="small">{result.note}</div>}
              </div>
              <div className="row foot-actions">
                {!ok && result.canAppeal && !appealed && <button className="btn ghost sm" type="button" onClick={appeal}>My answer is also correct</button>}
                <button className={'btn ' + (ok ? 'jade' : 'danger')} type="button" autoFocus onClick={advance}>Continue</button>
              </div>
            </>
          )}
          {phase === 'done' && final && (
            <div className="row center grow">
              {!final.pass && opts.retry && <button className="btn primary" type="button" onClick={() => { end(); opts.retry!(); }}>Try again</button>}
              {final.pass && nl && (opts.mode === 'lesson' || opts.mode === 'test') && <button className="btn primary" type="button" onClick={() => { end(); setTimeout(() => startLesson(nl), 0); }}>Next lesson</button>}
              <button className={'btn' + ((!final.pass && opts.retry) || (final.pass && nl && (opts.mode === 'lesson' || opts.mode === 'test')) ? '' : ' primary')} type="button" onClick={() => close(final)}>
                {(!final.pass && opts.retry) || (final.pass && nl && (opts.mode === 'lesson' || opts.mode === 'test')) ? 'Back to path' : 'Continue'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
const PRAISE = ['Correct!', 'Nice!', 'Great job!', '对了！', 'Well done!', 'Exactly!'];
const praise = (id: number) => PRAISE[id % PRAISE.length];

function Results({ r, opts, missed }: { r: SessionResult; opts: SessionOpts; missed: Item[] }) {
  const [xp, setXp] = useState(prefersReducedMotion() ? r.xp : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 700); setXp(Math.round(r.xp * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, []);
  const titles: Record<string, string> = { review: 'Review complete', test: 'Test passed', placement: 'Level passed', practice: 'Practice complete', lesson: 'Lesson complete' };
  const missedWords = [...new Set(missed.flatMap(m => m.words || []))].map(w => word(w)).filter(w => w && !w.extra).slice(0, 8);
  const mm = Math.floor(r.secs / 60), ss = String(r.secs % 60).padStart(2, '0');
  return (
    <div className="result">
      <motion.div className={'seal stamp' + (r.pass ? '' : ' grey')} initial={prefersReducedMotion() ? false : { scale: 1.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 220 }}>{r.pass ? '好' : '再'}</motion.div>
      <h2>{r.pass ? titles[opts.mode] : opts.mode === 'placement' ? 'Placement finished' : 'Not quite there'}</h2>
      {!r.pass ? <p className="muted">{opts.mode === 'placement' ? `You scored ${Math.round(r.acc * 100)}% here, so your path starts at this level.` : `You scored ${Math.round(r.acc * 100)}%. You need ${Math.round((opts.passMark || 0.8) * 100)}% to pass. Look over the words below and try again.`}</p>
        : opts.resultNote ? <p className="muted">{opts.resultNote(r)}</p> : null}
      <div className="statrow">
        <div className="stat"><span>XP</span><b className="tnum" style={{ color: 'var(--gold)' }}>+{xp}</b></div>
        <div className="stat"><span>Accuracy</span><b className="tnum" style={{ color: 'var(--jade)' }}>{Math.round(r.acc * 100)}%</b></div>
        <div className="stat"><span>Time</span><b className="tnum" style={{ color: 'var(--accent)' }}>{mm}:{ss}</b></div>
      </div>
      {missedWords.length > 0 && (
        <div className="missed">
          <div className="eyebrow">Words to watch · tap to hear</div>
          <div className="missed-list">{missedWords.map(w => <button key={w!.zh} className="missed-w" type="button" onClick={() => say(w!.zh)}><span className="hz">{w!.zh}</span><span className="small muted">{w!.py}</span><span className="small">{w!.g}</span></button>)}</div>
        </div>
      )}
      {r.selfGraded > 0 && <p className="small muted">{r.selfGraded} speaking item{r.selfGraded > 1 ? 's were' : ' was'} self-graded because automatic voice checking isn’t available on this device.</p>}
    </div>
  );
}
