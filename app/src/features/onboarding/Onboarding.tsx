/** First run: who you are, a daily goal, and a verified device setup. */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useProgress } from '../../state/progress';
import { levels, path } from '../../lib/course';
import { prefersReducedMotion } from '../../lib/util';
import { SetupCheck } from '../setup/SetupCheck';
import { startLesson, runPlacement } from '../path/actions';

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'zero' | 'test'>('zero');
  const [goal, setGoal] = useState(30);
  const finish = () => {
    useProgress.getState().set(p => { p.onboarded = true; p.placement = mode; p.settings.goal = goal; });
    if (mode === 'test') setTimeout(runPlacement, 100); else setTimeout(() => startLesson(path()[0]), 100);
  };
  const r = prefersReducedMotion();
  return (
    <main className="onboard">
      <div className="ob-progress" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={step} className="welcome" initial={r ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={r ? undefined : { opacity: 0, y: -12 }} transition={{ duration: 0.22 }}>
          {step === 0 && (
            <>
              <div className="seal big" aria-hidden="true">路</div>
              <h1>Mandarin, from your first tone to native fluency.</h1>
              <p className="lead">One guided path: pinyin and tones, then HSK 1 through 6, then a mastery stage of idioms and native texts. Every answer is checked for you, including what you say and what you write.</p>
              <div className="stage-strip" aria-hidden="true">{levels().map(L => <span key={L.key}><b className="hz">{L.hz}</b>{L.short}</span>)}</div>
              <button className="choice" type="button" onClick={() => { setMode('zero'); setStep(1); }}><b>I’m new to Mandarin</b><span>Start with the sounds and tones.</span></button>
              <button className="choice" type="button" onClick={() => { setMode('test'); setStep(1); }}><b>I already know some</b><span>Take a short placement test and skip what you know.</span></button>
            </>
          )}
          {step === 1 && (
            <>
              <h1>Pick a daily goal</h1>
              <p className="lead">Small and steady beats big and rare. You can change this later.</p>
              {[[10, 'Casual', 'About 5 minutes'], [20, 'Regular', 'About 10 minutes'], [30, 'Serious', 'About 15 minutes'], [50, 'Intense', 'About 25 minutes']].map(([v, l, d]) => (
                <button key={v} className="choice" type="button" aria-pressed={goal === v} onClick={() => setGoal(v as number)}><b>{l} · {v} XP a day</b><span>{d}</span></button>
              ))}
              <div className="row between"><button className="btn ghost" type="button" onClick={() => setStep(0)}>Back</button><button className="btn primary" type="button" onClick={() => setStep(2)}>Continue</button></div>
            </>
          )}
          {step === 2 && (
            <>
              <h1>Check your setup</h1>
              <p className="lead">A minute now means speaking and listening exercises work properly later. Skip anything you can’t do right now.</p>
              <SetupCheck />
              <div className="row between"><button className="btn ghost" type="button" onClick={() => setStep(1)}>Back</button><button className="btn primary" type="button" onClick={finish}>{mode === 'test' ? 'Start placement test' : 'Start lesson 1'}</button></div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
