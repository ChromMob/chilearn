/** Reading material and comprehension: grammar notes, dialogues, readings, questions, idioms. */
import { useMemo, useState } from 'react';
import type { ExProps } from '../types';
import type { Chengyu, Dialogue, Reading } from '../../../lib/types';
import { say, stopSpeech } from '../../../lib/audio';
import { sleep } from '../../../lib/util';
import { AudioButton, AudioPair, SentenceView } from '../../../ui/Hanzi';
import { Icon } from '../../../ui/Icon';
import { openSheet } from '../../../ui/Primitives';
import { useAudioReady } from '../../../state/hooks';
import { Ex, Options, Title, usePinyinHidden, useAutoplay } from './common';

export function GrammarCard({ item }: ExProps) {
  const g = item.g!; const audio = useAudioReady();
  return (
    <Ex>
      <div className="eyebrow">Grammar</div>
      <Title>{g.title}</Title>
      <div className="notecard">
        <div className="pattern hz">{g.pattern}</div>
        <p>{g.explain}</p>
        {g.examples.map((e, i) => (
          <div key={i} className="exline"><div className="grow"><SentenceView s={e} /><div className="trans">{e.en}</div></div>{audio && <AudioButton text={e.t.join('')} />}</div>
        ))}
      </div>
    </Ex>
  );
}
export function DialogueView({ d }: { d: Dialogue }) {
  const audio = useAudioReady(); const [open, setOpen] = useState<Set<number>>(new Set());
  const sides = useMemo(() => { const m: Record<string, string> = {}; let n = 0; d.lines.forEach(l => { if (!(l.who in m)) m[l.who] = n++ % 2 ? 'b' : 'a'; }); return m; }, [d]);
  const voiceOf = (who: string) => (sides[who] === 'b' ? 'm' : 'f') as 'f' | 'm';
  const playAll = async () => { for (const l of d.lines) { const ok = await say(l.t.join(''), { voice: voiceOf(l.who) }); if (!ok) break; await sleep(250); } };
  return (
    <>
      <div className="row">{audio && <button className="btn sm" type="button" onClick={playAll}><Icon name="play" />Play all</button>}<span className="hint">Tap a line for its translation, a word for its meaning.</span></div>
      <div className="dlg">
        {d.lines.map((l, i) => (
          <div key={i} className={'dlg-line ' + sides[l.who]}>
            <div className="who">{String(l.who).slice(0, 2)}</div>
            <div className="speech-bubble" onClick={e => { if ((e.target as HTMLElement).closest('.tok')) return; const n = new Set(open); n.has(i) ? n.delete(i) : n.add(i); setOpen(n); }}>
              <SentenceView s={l} />{open.has(i) && <div className="trans">{l.en}</div>}
            </div>
            {audio && <AudioButton text={l.t.join('')} voice={voiceOf(l.who)} />}
          </div>
        ))}
      </div>
    </>
  );
}
export function DialogueCard({ item, revealed }: ExProps) {
  const hide = usePinyinHidden(revealed);
  return <Ex hidePy={hide}><div className="eyebrow">Dialogue</div><Title>{item.d!.title}</Title><DialogueView d={item.d!} /></Ex>;
}
const splitSentences = (t: string) => t.match(/[^。！？!?]+[。！？!?”」]*/g) || [t];
export function ReadingView({ r, low }: { r: Reading; low?: boolean }) {
  const audio = useAudioReady();
  const [showPy, setShowPy] = useState(!!low); const [showEn, setShowEn] = useState(false);
  const sentences = useMemo(() => {
    const out: { text: string; py: string[] }[] = []; let i = 0;
    for (const s of splitSentences(r.zh)) { const chars = [...s]; out.push({ text: s, py: r.py.slice(i, i + chars.length) }); i += chars.length; }
    return out;
  }, [r]);
  const playAll = async () => { for (const s of sentences) { const ok = await say(s.text); if (!ok) break; await sleep(200); } };
  return (
    <>
      <div className="row">
        {audio && <button className="btn sm" type="button" onClick={playAll}><Icon name="play" />Listen</button>}
        <button className="btn sm" type="button" aria-pressed={showPy} onClick={() => setShowPy(!showPy)}>Pinyin</button>
        <button className="btn sm" type="button" aria-pressed={showEn} onClick={() => setShowEn(!showEn)}>Translation</button>
      </div>
      <p className="hint">Tap any sentence to hear it.</p>
      <div className="notecard">
        <div className={'reading' + (showPy ? ' with-py' : '')}>
          {sentences.map((s, si) => (
            <span key={si} className="rs" role="button" tabIndex={0} onClick={() => { stopSpeech(); say(s.text); }} onKeyDown={e => e.key === 'Enter' && say(s.text)}>
              {showPy ? [...s.text].map((c, i) => s.py[i] ? <ruby key={i}>{c}<rt>{s.py[i]}</rt></ruby> : <span key={i}>{c}</span>) : s.text}
            </span>
          ))}
        </div>
      </div>
      {showEn && <div className="notecard"><p>{r.en}</p></div>}
    </>
  );
}
export function ReadingCard({ item }: ExProps) {
  return <Ex><div className="eyebrow">Reading</div><Title>{item.r!.title}</Title><ReadingView r={item.r!} low={item.level === '1' || item.level === '2'} /></Ex>;
}
export function QuestionEx({ item, ctl, revealed }: ExProps) {
  const q = item.q!; const ref = item.ref!;
  const look = () => openSheet({ title: ref.title, wide: true, body: () => ('zh' in ref ? <ReadingView r={ref as Reading} /> : <DialogueView d={ref as Dialogue} />) });
  return (
    <Ex>
      <div className="eyebrow">Comprehension</div>
      <Title>{q.q}</Title>
      {q.qEn && <p className="muted">{q.qEn}</p>}
      <Options options={q.options} correct={q.answer} revealed={revealed} render={o => o} ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: <span>{q.options[q.answer]}</span> })) }} />
      <div className="row"><button className="btn ghost sm" type="button" onClick={look}><Icon name="book" />Look at the text again</button></div>
    </Ex>
  );
}
export function ChengyuCard({ item }: ExProps) {
  const c = item.c!; const audio = useAudioReady();
  useAutoplay(c.zh);
  return (
    <Ex className="intro">
      <div className="eyebrow">Idiom · 成语</div>
      <div className="bigword"><div className="hz bw-hz cy">{c.zh}</div><div className="bw-py">{c.py}</div><div className="bw-g">{c.en}</div></div>
      <div className="row center"><AudioPair text={c.zh} big /></div>
      <div className="notecard">
        <div><span className="eyebrow">Literally </span>{c.lit}</div>
        <div className="exline"><div className="grow"><div className="hz ex-zh">{c.example.zh}</div><div className="trans">{c.example.en}</div></div>{audio && <AudioButton text={c.example.zh} />}</div>
      </div>
    </Ex>
  );
}
const cyAnswer = (c: Chengyu) => <span><span className="hz">{c.zh}</span> · {c.en}</span>;
export function McChengyu({ item, ctl, revealed }: ExProps) {
  const c = item.c!; const opts = item.options as Chengyu[]; const correct = opts.findIndex(o => o.zh === c.zh);
  return (
    <Ex>
      <Title>What does this idiom mean?</Title>
      <div className="prompt-word"><span className="hz pw-hz cy">{c.zh}</span><AudioPair text={c.zh} /></div>
      <Options options={opts} correct={correct} revealed={revealed} render={o => o.en} ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: cyAnswer(c) })) }} />
    </Ex>
  );
}
export function FillChengyu({ item, ctl, revealed }: ExProps) {
  const c = item.c!; const opts = item.options as Chengyu[]; const correct = opts.findIndex(o => o.zh === c.zh);
  const [p, setP] = useState<string | null>(null);
  const parts = c.example.zh.split(c.zh);
  return (
    <Ex>
      <Title>Choose the idiom that fits</Title>
      <div className="hz cy-sentence">{parts[0]}<span className={'tok blank' + (p || revealed ? ' filled' : '')}><span className="c">{revealed ? c.zh : p || c.zh}</span></span>{parts.slice(1).join(c.zh)}</div>
      <div className="trans">{c.example.en}</div>
      <Options options={opts} correct={correct} grid hz revealed={revealed} onPick={i => setP(opts[i].zh)} render={o => <span className="c cy-opt">{o.zh}</span>} ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: cyAnswer(c) })) }} />
    </Ex>
  );
}
