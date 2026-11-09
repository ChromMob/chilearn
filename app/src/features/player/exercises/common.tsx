/** Shared pieces for exercise components. */
import { useEffect, useState, type ReactNode } from 'react';
import { say } from '../../../lib/audio';
import { useProgress } from '../../../state/progress';
import type { ExCtl } from '../types';
import type { Word } from '../../../lib/types';
import { ToneColored } from '../../../ui/Hanzi';

export function usePinyinHidden(revealed: boolean) {
  const mode = useProgress(s => s.settings.pinyin);
  return mode === 'never' || (mode === 'hint' && !revealed);
}
export function useAutoplay(text: string | undefined, delay = 180) {
  useEffect(() => { if (!text) return; const t = setTimeout(() => say(text), delay); return () => clearTimeout(t); }, [text]);
}
export function Title({ children }: { children: ReactNode }) { return <h2 className="ex-kind">{children}</h2>; }
export function Ex({ children, hidePy, className = '' }: { children: ReactNode; hidePy?: boolean; className?: string }) {
  return <div className={'ex ' + className + (hidePy ? ' hide-py' : '')}>{children}</div>;
}
export const wordAnswer = (w: Pick<Word, 'zh' | 'py' | 'g'>) => <span className="word-ans"><ToneColored zh={w.zh} py={w.py} /> <span>{w.py}</span>{w.g ? <span className="muted"> · {w.g}</span> : null}</span>;

/** Option buttons with selection, keyboard numbers and right/wrong marking after reveal. */
export function Options<T>({ options, render, correct, ctl, revealed, grid, hz, onPick }: {
  options: T[]; render: (o: T, i: number) => ReactNode; correct: number; ctl: ExCtl; revealed: boolean; grid?: boolean; hz?: boolean; onPick?: (i: number) => void;
}) {
  const [sel, setSel] = useState(-1);
  const choose = (i: number) => { if (revealed) return; setSel(i); ctl.ready(true); onPick?.(i); };
  useEffect(() => { ctl.onOptions(options.length, choose); });
  useEffect(() => { ctl.onCheck(() => ({ ok: sel === correct })); });
  return (
    <div className={'opts' + (grid ? ' grid2' : '')} role="radiogroup">
      {options.map((o, i) => {
        const state = revealed ? (i === correct ? ' right' : i === sel ? ' wrong' : ' dim') : '';
        return (
          <button key={i} type="button" role="radio" aria-checked={sel === i} disabled={revealed} className={'opt' + (hz ? ' hzopt' : '') + state} onClick={() => choose(i)}>
            <span className="k" aria-hidden="true">{i + 1}</span><span className="v">{render(o, i)}</span>
          </button>
        );
      })}
    </div>
  );
}
/** Wraps an exercise's check() so it can attach answer info while Options handles ok/not ok. */
export function useCheck(ctl: ExCtl, fn: () => ReturnType<Parameters<ExCtl['onCheck']>[0]>) { useEffect(() => { ctl.onCheck(fn); }); }
