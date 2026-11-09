/** Stage 0 exercises: tone intro, tone/syllable listening, dictation, tone-change rules. */
import { useEffect, useRef, useState } from 'react';
import type { ExProps } from '../types';
import { sylChar } from '../../../lib/data';
import { gradePinyin, numToMark } from '../../../lib/pinyin';
import { say } from '../../../lib/audio';
import { micSupport, recognitionSupported } from '../../../lib/mic';
import { AudioButton, AudioPair } from '../../../ui/Hanzi';
import { Icon, ToneShape } from '../../../ui/Icon';
import { Banner } from '../../../ui/Primitives';
import { Ex, Options, Title, useAutoplay } from './common';

export function PinIntro({ item }: ExProps) {
  let body;
  if (item.topic === 'tones') body = (
    <>
      <p>Mandarin is tonal: the pitch of a syllable changes its meaning. mā (mother), má (hemp), mǎ (horse) and mà (to scold) differ only in tone. Tap each one and follow the pitch line.</p>
      <div className="syl-row">{[1, 2, 3, 4].map(t => { const ch = sylChar('ma', t)!; return (
        <button key={t} type="button" className="syl" onClick={() => say(ch)}><ToneShape tone={t} /><span className="c hz">{ch}</span><span className="b">{numToMark('ma' + t)}</span><small className="muted">{['', 'high, level', 'rising', 'low, dipping', 'falling'][t]}</small></button>
      ); })}</div>
      <p className="muted small">There is also a light neutral tone, written without a mark, like the second syllable of māma.</p>
    </>
  );
  else if (item.topic === 'say') body = (
    <>
      <p>Now say each tone. Your pitch is drawn over the target shape, and the app tells you which tone it heard.</p>
      <p className="muted">Exaggerate at first. Tone 1 stays high like a held note. Tone 2 rises like a surprised “huh?”. Tone 3 dips low. Tone 4 drops fast like a firm “No!”.</p>
      {(micSupport() === 'blocked' || micSupport() === 'unsupported') && <Banner tone="warn" icon="mic">This view can’t use the microphone, so these items become listen-and-repeat with self-grading.</Banner>}
    </>
  );
  else if (item.topic === 'pairs') body = <p>In real words, tones combine. Listen to each word and mark the tone of every syllable. Watch for light, neutral syllables like the second 谢 in 谢谢 xièxie.</p>;
  else body = (
    <>
      <p>{item.note}</p>
      {item.syl && <div className="row wrap">{item.syl.map(b => { const ch = sylChar(b, 1) || sylChar(b, 4) || sylChar(b, 2) || sylChar(b, 3); return ch ? <button key={b} className="btn sm" type="button" onClick={() => say(ch)}>{b}</button> : null; })}</div>}
    </>
  );
  return <Ex><div className="eyebrow">Sounds</div><Title>{item.title || (item.topic === 'tones' ? 'The four tones' : item.topic === 'say' ? 'Speak the tones' : 'Tones in words')}</Title><div className="notecard">{body}</div></Ex>;
}
export function PinToneListen({ item, ctl, revealed }: ExProps) {
  const t = item.t!; const [sel, setSel] = useState(0);
  useAutoplay(item.visual ? undefined : item.ch);
  useEffect(() => { ctl.onOptions(4, i => { if (!revealed) { setSel(i + 1); ctl.ready(true); } }); ctl.onCheck(() => ({ ok: sel === t, answer: <span><span className="hz">{item.ch}</span> {numToMark(item.base! + t)} · tone {t}</span> })); });
  return (
    <Ex>
      <Title>{item.visual ? 'Which tone is marked here?' : 'Which tone do you hear?'}</Title>
      {item.visual
        ? <div className="bigword"><div className="hz bw-hz">{item.ch}</div><div className="bw-py ink">{numToMark(item.base! + t)}</div></div>
        : <div className="listen-hero"><AudioButton text={item.ch!} big /><AudioButton text={item.ch!} slow /></div>}
      <div className="tones four" role="radiogroup">
        {[1, 2, 3, 4].map(n => (
          <button key={n} type="button" role="radio" aria-checked={sel === n} disabled={revealed} className={'tonebtn' + (revealed ? (n === t ? ' right' : n === sel ? ' wrong' : '') : '')} onClick={() => { setSel(n); ctl.ready(true); }}>
            <ToneShape tone={n} />{!item.visual && <span>{numToMark(item.base! + n)}</span>}<small>tone {n}</small>
          </button>
        ))}
      </div>
    </Ex>
  );
}
export function PinPick({ item, ctl, revealed }: ExProps) {
  const opts = item.options as string[]; const correct = opts.indexOf(item.base!);
  useAutoplay(item.ch);
  return (
    <Ex>
      <Title>Which syllable do you hear?</Title>
      <div className="listen-hero"><AudioButton text={item.ch!} big /><AudioButton text={item.ch!} slow /></div>
      <Options options={opts} correct={correct} grid revealed={revealed} render={o => <span className="py-opt">{numToMark(o + item.t)}</span>}
        ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: <span><span className="hz">{item.ch}</span> {numToMark(item.base! + item.t)}</span> })) }} />
    </Ex>
  );
}
export function PinType({ item, ctl, revealed }: ExProps) {
  const [v, setV] = useState(''); const ref = useRef<HTMLInputElement>(null);
  const target = numToMark(item.base! + item.t);
  useAutoplay(item.ch);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 150); return () => clearTimeout(t); }, []);
  useEffect(() => { ctl.onCheck(() => { const g = gradePinyin(v, target); return { ok: g === 'right', grade: g === 'tones' ? 1 : undefined, given: v, note: g === 'tones' ? 'Right sound, wrong tone.' : '', answer: <span><span className="hz">{item.ch}</span> {target}</span> }; }); });
  return (
    <Ex>
      <Title>Type what you hear</Title>
      <div className="listen-hero"><AudioButton text={item.ch!} big /><AudioButton text={item.ch!} slow /></div>
      <input ref={ref} className="textin" type="text" value={v} disabled={revealed} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="e.g. ma3" aria-label="Pinyin you heard" onChange={e => { setV(e.target.value); ctl.ready(e.target.value.trim().length > 0); }} />
      <p className="hint">Write the syllable with its tone number, like ma3 or lü4 (v works for ü).</p>
    </Ex>
  );
}
export function Sandhi({ item, ctl, revealed }: ExProps) {
  const it = item.it!; const opts = item.options as string[];
  useAutoplay(it.zh);
  return (
    <Ex>
      <Title>How is it actually said?</Title>
      <div className="prompt-word"><span className="hz pw-hz">{it.zh}</span><span className="muted">dictionary: {it.cite}</span><AudioPair text={it.zh} /></div>
      <Options options={opts} correct={opts.indexOf(it.said)} revealed={revealed} render={o => o} ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: <span>{it.zh} → {it.said} ({it.rule})</span> })) }} />
    </Ex>
  );
}
export { recognitionSupported };
