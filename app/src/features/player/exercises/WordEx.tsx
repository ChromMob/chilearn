/** Word exercises: intro card, meaning/hanzi/listening choice, tone marking, pinyin typing, matching pairs, handwriting. */
import { useEffect, useMemo, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import type { ExProps } from '../types';
import type { Word } from '../../../lib/types';
import { word, strokeData } from '../../../lib/data';
import { gradePinyin, parseMarked, pinyinTargets, isHan } from '../../../lib/pinyin';
import { say, chime } from '../../../lib/audio';
import { shuffle } from '../../../lib/util';
import { AudioPair, AudioButton, ToneColored, SentenceView, StrokeAnim, useCss } from '../../../ui/Hanzi';
import { Icon, ToneShape } from '../../../ui/Icon';
import { Ex, Options, Title, useAutoplay, usePinyinHidden, wordAnswer } from './common';

const W = (it: ExProps['item']): Word => it.wobj || word(it.w!) || { zh: it.w!, py: '', g: '', en: '', l: it.level };

export function Intro({ item, ctl }: ExProps) {
  const w = W(item);
  useAutoplay(w.zh);
  const example = useMemo(() => item.unit?.sentences.find(s => s.t.includes(w.zh) && s.t.length <= 12), [item]);
  return (
    <Ex className="intro">
      <div className="eyebrow">New word</div>
      <div className="bigword">
        <ToneColored zh={w.zh} py={w.py} className="bw-hz" />
        <div className="bw-py">{w.py}</div>
        <div className="bw-g">{w.g}</div>
      </div>
      <div className="row center"><AudioPair text={w.zh} big /></div>
      {w.en && w.en !== w.g && <p className="muted small center-text">{w.en}</p>}
      {[...w.zh].every(isHan) && [...w.zh].length <= 4 && <div className="row center">{[...w.zh].map((c, i) => <StrokeAnim key={i} ch={c} />)}</div>}
      {example && (
        <div className="notecard">
          <div className="eyebrow">Example</div>
          <div className="row"><SentenceView s={example} /><AudioPair text={example.t.join('')} /></div>
          <div className="trans">{example.en}</div>
        </div>
      )}
    </Ex>
  );
}

export function McMeaning({ item, ctl, revealed }: ExProps) {
  const w = W(item); const opts = item.options as Word[]; const correct = opts.findIndex(o => o.zh === w.zh);
  const hide = usePinyinHidden(revealed);
  useAutoplay(w.zh);
  return (
    <Ex hidePy={hide}>
      <Title>What does this mean?</Title>
      <div className="prompt-word">
        <div><div className="hz pw-hz">{w.zh}</div><div className="pw-py p">{w.py}</div></div>
        <AudioPair text={w.zh} />
      </div>
      <Options options={opts} correct={correct} ctl={withAnswer(ctl, () => wordAnswer(w))} revealed={revealed} render={o => o.g} />
    </Ex>
  );
}
/** Decorates a ctl so the Options' check result carries the answer display. */
function withAnswer(ctl: ExProps['ctl'], answer: () => React.ReactNode, extra?: object): ExProps['ctl'] {
  return { ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: answer(), ...extra })) };
}
export function McHanzi({ item, ctl, revealed }: ExProps) {
  const w = W(item); const opts = item.options as Word[]; const correct = opts.findIndex(o => o.zh === w.zh);
  const hide = usePinyinHidden(revealed);
  return (
    <Ex hidePy={hide}>
      <Title>Which one means “{w.g}”?</Title>
      <Options options={opts} correct={correct} grid hz ctl={withAnswer(ctl, () => wordAnswer(w))} revealed={revealed} onPick={i => say(opts[i].zh)}
        render={o => <><span className="c">{o.zh}</span><span className="p">{o.py}</span></>} />
    </Ex>
  );
}
export function ListenPick({ item, ctl, revealed }: ExProps) {
  const w = W(item); const opts = item.options as Word[]; const correct = opts.findIndex(o => o.zh === w.zh);
  useAutoplay(w.zh);
  return (
    <Ex hidePy={!revealed}>
      <Title>What do you hear?</Title>
      <div className="listen-hero"><AudioButton text={w.zh} big /><AudioButton text={w.zh} slow /></div>
      <Options options={opts} correct={correct} grid hz ctl={withAnswer(ctl, () => wordAnswer(w))} revealed={revealed}
        render={o => <><span className="c">{o.zh}</span><span className="p">{o.py}</span></>} />
    </Ex>
  );
}
export function Tones({ item, ctl, revealed }: ExProps) {
  const w = W(item); const syl = parseMarked(w.py); const chars = [...w.zh];
  const target = syl.map(s => s.tone as number);
  const variants = pinyinTargets(w.py, w.zh).variants;
  const [sel, setSel] = useState<number[]>(syl.map(() => 0));
  useAutoplay(w.zh);
  useEffect(() => {
    ctl.onCheck(() => {
      const nonNeutral = sel.filter(t => t !== 5);
      const ok = sel.every((t, i) => t === target[i]) || variants.some(v => v.length === nonNeutral.length && v.every((t, i) => t === nonNeutral[i]) && sel.every((t, i) => (t === 5) === (target[i] === 5)));
      return { ok, answer: wordAnswer(w) };
    });
  });
  return (
    <Ex>
      <Title>Mark the tones</Title>
      <div className="prompt-word"><span className="hz pw-hz">{w.zh}</span><AudioPair text={w.zh} />{w.g && <span className="muted">{w.g}</span>}</div>
      {syl.map((s, i) => (
        <div key={i} className="tone-row">
          <div className="tr-label"><span className="hz">{chars[i] || ''}</span><b>{s.base}</b></div>
          <div className="tones" role="radiogroup" aria-label={`Tone of ${s.base}`}>
            {[1, 2, 3, 4, 5].map(t => {
              const st = revealed ? (t === target[i] ? ' right' : t === sel[i] ? ' wrong' : '') : '';
              return (
                <button key={t} type="button" role="radio" aria-checked={sel[i] === t} disabled={revealed} className={'tonebtn' + st}
                  onClick={() => { const n = sel.slice(); n[i] = t; setSel(n); chime('tap'); ctl.ready(n.every(Boolean)); }}>
                  <ToneShape tone={t} /><small>{t === 5 ? 'neutral' : 'tone ' + t}</small>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Ex>
  );
}
export function TypePinyin({ item, ctl, revealed }: ExProps) {
  const w = W(item); const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 150); return () => clearTimeout(t); }, []);
  useEffect(() => {
    ctl.onCheck(() => {
      const g = gradePinyin(v, w.py, w.zh);
      return { ok: g === 'right', grade: g === 'tones' ? 1 : undefined, answer: wordAnswer(w), given: v, note: g === 'tones' ? 'The syllables are right. Check the tones.' : '' };
    });
  });
  return (
    <Ex>
      <Title>Type the pinyin</Title>
      <div className="prompt-word"><span className="hz pw-hz">{w.zh}</span><AudioPair text={w.zh} /><span className="muted">{w.g}</span></div>
      <input ref={ref} className="textin" type="text" value={v} disabled={revealed} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="e.g. ni3 hao3" aria-label="Pinyin answer"
        onChange={e => { setV(e.target.value); ctl.ready(e.target.value.trim().length > 0); }} />
      <p className="hint">Add tones as numbers after each syllable (ma3, lü4 or lv4) or as marks (mǎ). Neutral tone: no number.</p>
    </Ex>
  );
}
export function Match({ item, ctl }: ExProps) {
  const pairs = item.pairs!;
  const left = useMemo(() => shuffle(pairs), []); const right = useMemo(() => shuffle(pairs), []);
  const [selL, setSelL] = useState<Word | null>(null); const [selR, setSelR] = useState<Word | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set()); const [bad, setBad] = useState<string[]>([]);
  const mistakes = useRef(0);
  useEffect(() => { ctl.onCheck(() => ({ ok: mistakes.current <= 1, answer: <span>{pairs.map(p => `${p.zh} ${p.g}`).join(' · ')}</span>, note: mistakes.current ? `${mistakes.current} mismatch${mistakes.current > 1 ? 'es' : ''}.` : '' })); });
  useEffect(() => {
    if (!selL || !selR) return;
    if (selL.zh === selR.zh) {
      const g = new Set(gone); g.add(selL.zh); setGone(g); chime('tap');
      if (g.size === pairs.length) setTimeout(() => ctl.submit(), 350);
    } else { mistakes.current++; setBad([selL.zh, 'r' + selR.zh]); chime('bad'); setTimeout(() => setBad([]), 450); }
    setSelL(null); setSelR(null);
  }, [selL, selR]);
  return (
    <Ex>
      <Title>Match the pairs</Title>
      <div className="match">
        {left.map((l, i) => (
          [<button key={'l' + i} type="button" className={'opt hzopt' + (gone.has(l.zh) ? ' gone' : '') + (bad.includes(l.zh) ? ' wrong' : '')} aria-pressed={selL?.zh === l.zh} disabled={gone.has(l.zh)} onClick={() => { setSelL(l); say(l.zh); }}>
            <span className="c">{l.zh}</span><span className="p">{l.py}</span></button>,
          <button key={'r' + i} type="button" className={'opt' + (gone.has(right[i].zh) ? ' gone' : '') + (bad.includes('r' + right[i].zh) ? ' wrong' : '')} aria-pressed={selR?.zh === right[i].zh} disabled={gone.has(right[i].zh)} onClick={() => setSelR(right[i])}>
            <span className="v center-text">{right[i].g}</span></button>]
        ))}
      </div>
    </Ex>
  );
}
export function Write({ item, ctl }: ExProps) {
  const w = W(item); const chars = [...w.zh];
  const [idx, setIdx] = useState(0); const [doneChars, setDone] = useState(0);
  const box = useRef<HTMLDivElement>(null); const writer = useRef<any>(null);
  const mistakes = useRef(0), strokes = useRef(0), finished = useRef(false);
  const colors = { ink: useCss('--ink'), bg2: useCss('--bg-2'), accent: useCss('--accent'), jade: useCss('--jade') };
  useEffect(() => { ctl.onCheck(() => ({ ok: finished.current && mistakes.current <= Math.max(2, Math.round(strokes.current * 0.3)), answer: wordAnswer(w), note: `${mistakes.current} stroke mistake${mistakes.current === 1 ? '' : 's'}.` })); });
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await strokeData(chars[idx]);
      if (!alive || !box.current) return;
      if (!d) { ctl.skip('Stroke data missing — skipped.'); return; }
      strokes.current += d.strokes.length;
      box.current.innerHTML = '';
      const size = box.current.clientWidth || 280;
      writer.current = HanziWriter.create(box.current, chars[idx], {
        width: size, height: size, padding: 14, showCharacter: false, showOutline: !item.review, showHintAfterMisses: 2, highlightOnComplete: true,
        drawingWidth: Math.max(16, size / 14), strokeColor: colors.ink, outlineColor: colors.bg2, drawingColor: colors.accent, highlightColor: colors.jade,
        charDataLoader: (_c: string, ok: (x: any) => void) => ok(d),
      });
      quiz();
    })();
    return () => { alive = false; try { writer.current?.cancelQuiz(); } catch { /* ignore */ } };
  }, [idx]);
  function quiz() {
    writer.current?.quiz({ onMistake: () => { mistakes.current++; }, onComplete: () => setTimeout(() => {
      setDone(n => n + 1);
      if (idx + 1 < chars.length) setIdx(idx + 1); else { finished.current = true; ctl.submit(); }
    }, 400) });
  }
  return (
    <Ex>
      <Title>Write it</Title>
      <div className="row center"><b className="big-py">{w.py}</b><span className="muted">{w.g}</span><AudioPair text={w.zh} /></div>
      <div className="writer-chars">{chars.map((c, i) => <span key={i} className={i < doneChars ? 'ok' : i === idx ? 'on' : ''}>{i < doneChars ? c : '？'}</span>)}</div>
      <div className="writer-box">
        <svg className="grid" viewBox="0 0 100 100" aria-hidden="true"><path d="M0 0L100 100M100 0L0 100M50 0V100M0 50H100" stroke="currentColor" strokeOpacity=".12" strokeDasharray="3 3" fill="none" /></svg>
        <div ref={box} className="writer-canvas" />
      </div>
      <p className="hint center-text">Draw each stroke in order. After two misses a hint appears.</p>
      <div className="row center">
        <button className="btn ghost sm" type="button" onClick={() => { mistakes.current += 2; writer.current?.animateCharacter({ onComplete: () => quiz() }); }}><Icon name="bulb" />Show me</button>
        <button className="btn ghost sm" type="button" onClick={() => ctl.skip('Skipped writing')}><Icon name="skip" />Skip writing</button>
      </div>
    </Ex>
  );
}
