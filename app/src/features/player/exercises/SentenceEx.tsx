/** Sentence exercises: build from tiles (or type), dictation, translation choice, fill in the blank. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExProps } from '../types';
import type { Sentence } from '../../../lib/types';
import { word } from '../../../lib/data';
import { hanOnly, isPunct } from '../../../lib/pinyin';
import { say } from '../../../lib/audio';
import { shuffle } from '../../../lib/util';
import { AudioButton, AudioPair, SentenceView } from '../../../ui/Hanzi';
import { Icon } from '../../../ui/Icon';
import { Ex, Options, Title, useAutoplay, usePinyinHidden } from './common';

const ACC_KEY = 'luxian.accepted';
function accepted(): Record<string, string[]> { try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch { return {}; } }
function accept(key: string, ans: string) { try { const a = accepted(); a[key] = [...new Set([...(a[key] || []), ans])]; localStorage.setItem(ACC_KEY, JSON.stringify(a)); } catch { /* ignore */ } }

export function sentAnswer(s: Sentence) {
  return (<div className="sent-ans"><div className="hz sa-zh">{s.t.join('')}</div><div className="small muted">{(s.p || []).filter(Boolean).join(' ')}</div>{s.en && <div className="small">{s.en}</div>}</div>);
}
const sameMultiset = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

function Builder({ item, ctl, revealed, listen }: ExProps & { listen?: boolean }) {
  const s = item.s!; const toks = s.t.filter(t => !isPunct(t));
  const pyOf = (t: string) => { const i = s.t.indexOf(t); if (i >= 0 && s.p?.[i]) return s.p[i]; return word(t)?.py || ''; };
  const tiles = useMemo(() => shuffle([...toks, ...(item.extraTiles || [])]).map((t, id) => ({ t, id })), []);
  const [chosen, setChosen] = useState<number[]>([]);
  const [typed, setTyped] = useState<string | null>(null);
  const hide = usePinyinHidden(revealed);
  const key = s.t.join('');
  useAutoplay(listen ? key : undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { ctl.ready(typed != null ? typed.trim().length > 0 : chosen.length > 0); }, [chosen, typed]);
  useEffect(() => {
    ctl.onCheck(() => {
      const targets = [s.t, ...(s.alt || [])].map(a => hanOnly(a.filter(t => !isPunct(t)).join('')) || a.join(''));
      const extraOk = accepted()[key] || [];
      const givenToks = chosen.map(i => tiles[i].t);
      const given = typed != null ? (hanOnly(typed) || typed.replace(/\s/g, '')) : givenToks.join('');
      const ok = targets.includes(hanOnly(given) || given) || extraOk.includes(given);
      const perm = typed == null && !ok && sameMultiset(givenToks, toks);
      return { ok, answer: sentAnswer(s), given: ok ? null : given, canAppeal: !ok && (perm || typed != null), onAppeal: () => accept(key, given),
        note: perm ? 'You used the right words in a different order.' : '' };
    });
  });
  return (
    <Ex hidePy={hide}>
      <Title>{listen ? 'Write what you hear' : 'Translate into Chinese'}</Title>
      {listen ? <div className="listen-hero"><AudioButton text={key} big /><AudioButton text={key} slow /></div> : <div className="speech-bubble prompt-en">{s.en}</div>}
      {typed == null ? (
        <>
          <div className="answer-line" aria-label="Your answer">
            {chosen.map((ti, pos) => (
              <button key={tiles[ti].id} type="button" className="tile" disabled={revealed} onClick={() => setChosen(c => c.filter((_, j) => j !== pos))}>
                <span className="p">{pyOf(tiles[ti].t)}</span><span className="c">{tiles[ti].t}</span>
              </button>
            ))}
          </div>
          <div className="bank">
            {tiles.map((tile, i) => (
              <button key={tile.id} type="button" className={'tile' + (chosen.includes(i) ? ' used' : '')} disabled={revealed || chosen.includes(i)} aria-hidden={chosen.includes(i)}
                onClick={() => { setChosen(c => [...c, i]); say(tile.t); }}>
                <span className="p">{pyOf(tile.t)}</span><span className="c">{tile.t}</span>
              </button>
            ))}
          </div>
          {!revealed && <div className="row center"><button className="btn ghost sm" type="button" onClick={() => { setTyped(''); setTimeout(() => inputRef.current?.focus(), 50); }}><Icon name="keyboard" />Type with a Chinese keyboard</button></div>}
        </>
      ) : (
        <>
          <input ref={inputRef} className="textin hzin" type="text" value={typed} disabled={revealed} autoComplete="off" placeholder="用中文输入…" aria-label="Type the Chinese sentence" onChange={e => setTyped(e.target.value)} />
          {!revealed && <div className="row center"><button className="btn ghost sm" type="button" onClick={() => setTyped(null)}>Use word tiles instead</button></div>}
        </>
      )}
    </Ex>
  );
}
export const Build = (p: ExProps) => <Builder {...p} />;
export const ListenBuild = (p: ExProps) => <Builder {...p} listen />;

export function McTranslate({ item, ctl, revealed }: ExProps) {
  const s = item.s!; const opts = item.options as string[]; const correct = opts.indexOf(s.en);
  const hide = usePinyinHidden(revealed);
  useAutoplay(s.t.join(''));
  return (
    <Ex hidePy={hide}>
      <Title>What does this mean?</Title>
      <div className="row"><SentenceView s={s} size="lg" /><AudioPair text={s.t.join('')} /></div>
      <p className="hint">Tap a word to see its meaning.</p>
      <Options options={opts} correct={correct} revealed={revealed} render={o => o} ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: sentAnswer(s) })) }} />
    </Ex>
  );
}
export function Fill({ item, ctl, revealed }: ExProps) {
  const s = item.s!; const ans = s.t[item.idx!]; const opts = item.options as string[]; const correct = opts.indexOf(ans);
  const [pickd, setPickd] = useState<string | null>(null);
  const hide = usePinyinHidden(revealed);
  return (
    <Ex hidePy={hide}>
      <Title>Fill in the blank</Title>
      <SentenceView s={s} blank={item.idx} filled={revealed ? ans : pickd} size="lg" />
      <div className="trans">{s.en}</div>
      <Options options={opts} correct={correct} grid hz revealed={revealed} onPick={i => setPickd(opts[i])}
        ctl={{ ...ctl, onCheck: fn => ctl.onCheck(() => ({ ...fn(), answer: sentAnswer(s) })) }}
        render={o => <><span className="c">{o}</span><span className="p">{word(o)?.py || ''}</span></>} />
    </Ex>
  );
}
