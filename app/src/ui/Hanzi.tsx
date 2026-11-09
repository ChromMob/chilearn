/** Chinese text building blocks: tone-coloured characters, tappable words with glosses, sentences, audio buttons, stroke animation. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import HanziWriter from 'hanzi-writer';
import { parseMarked, isPunct } from '../lib/pinyin';
import { say, ttsAvailable } from '../lib/audio';
import { word, strokeData } from '../lib/data';
import type { Sentence } from '../lib/types';
import { Icon } from './Icon';
import { useAudioReady } from '../state/hooks';

export function ToneColored({ zh, py, className = '' }: { zh: string; py?: string; className?: string }) {
  const syl = parseMarked(py || ''); const chars = [...zh];
  if (syl.length !== chars.length) return <span className={'hz ' + className}>{zh}</span>;
  return <span className={'hz ' + className}>{chars.map((c, i) => <span key={i} style={{ color: `var(--t${syl[i].tone})` }}>{c}</span>)}</span>;
}

// ---------- gloss popover (one at a time) ----------
interface Pop { t: string; x: number; y: number; id: number }
const usePop = create<{ pop: Pop | null; show: (p: Omit<Pop, 'id'>) => void; hide: () => void }>(set => ({ pop: null, show: p => set({ pop: { ...p, id: Date.now() } }), hide: () => set({ pop: null }) }));
export function GlossPopover() {
  const { pop, hide } = usePop();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -999, top: -999 });
  useEffect(() => {
    if (!pop) return;
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(window.innerWidth - r.width - 8, pop.x - r.width / 2)), top: Math.max(8, pop.y - r.height - 10) });
    const t = setTimeout(hide, 3000);
    const away = () => hide();
    window.addEventListener('scroll', away, true);
    return () => { clearTimeout(t); window.removeEventListener('scroll', away, true); };
  }, [pop?.id]);
  if (!pop) return null;
  const w = word(pop.t);
  return (
    <div ref={ref} className="gloss-pop" style={{ left: pos.left, top: pos.top }} role="tooltip">
      <div className="gp-top"><span className="hz">{pop.t}</span>{w?.py && <span className="gp-py">{w.py}</span>}</div>
      <div className="gp-g">{w ? w.g : 'No gloss available'}</div>
    </div>
  );
}
export function Tok({ t, p, tap = true }: { t: string; p?: string; tap?: boolean }) {
  const punct = isPunct(t);
  if (punct || !tap) return <span className="tok"><span className="p">{punct ? '' : p}</span><span className="c">{t}</span></span>;
  return (
    <button type="button" className="tok tap" onClick={e => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      usePop.getState().show({ t, x: r.left + r.width / 2, y: r.top });
      say(t);
    }}><span className="p">{p}</span><span className="c">{t}</span></button>
  );
}
export function SentenceView({ s, blank, filled, tap = true, size }: { s: Sentence; blank?: number; filled?: string | null; tap?: boolean; size?: 'sm' | 'lg' }) {
  return (
    <div className={'sent' + (size ? ' ' + size : '')}>
      {s.t.map((t, i) => i === blank
        ? <span key={i} className={'tok blank' + (filled ? ' filled' : '')}><span className="p" /><span className="c">{filled || t}</span></span>
        : <Tok key={i} t={t} p={s.p?.[i]} tap={tap} />)}
    </div>
  );
}
export function AudioButton({ text, slow, big, label, voice }: { text: string; slow?: boolean; big?: boolean; label?: string; voice?: 'f' | 'm' }) {
  const [playing, setPlaying] = useState(false);
  return (
    <button type="button" className={'iconbtn audio' + (big ? ' lg' : '') + (playing ? ' playing' : '')} aria-label={label || (slow ? 'Play slowly' : 'Play audio')}
      onClick={async () => { setPlaying(true); await say(text, { slow, voice }); setPlaying(false); }}>
      <Icon name={slow ? 'slow' : 'speaker'} />
    </button>
  );
}
export function AudioPair({ text, big, voice }: { text: string; big?: boolean; voice?: 'f' | 'm' }) {
  const ready = useAudioReady();
  if (!ready) return null;
  return <div className="row audio-pair"><AudioButton text={text} big={big} voice={voice} /><AudioButton text={text} slow voice={voice} /></div>;
}
export function useCss(varName: string) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }

/** Stroke-order animation for one character; tap to replay. */
export function StrokeAnim({ ch, size = 84, autoplay = true }: { ch: string; size?: number; autoplay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const writer = useRef<any>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    strokeData(ch).then(d => {
      if (!alive || !ref.current) return;
      if (!d) { setMissing(true); return; }
      ref.current.innerHTML = '';
      writer.current = HanziWriter.create(ref.current, ch, { width: size, height: size, padding: 6, showOutline: true, strokeAnimationSpeed: 1.4, delayBetweenStrokes: 120,
        strokeColor: useCss('--ink'), outlineColor: useCss('--line'), charDataLoader: (_c: string, ok: (x: any) => void) => ok(d) });
      if (autoplay) setTimeout(() => alive && writer.current?.animateCharacter(), 500);
    });
    return () => { alive = false; };
  }, [ch, size]);
  if (missing) return null;
  return <button type="button" className="stroke-box" style={{ width: size, height: size }} aria-label={`Replay stroke order of ${ch}`} onClick={() => writer.current?.animateCharacter()}><div ref={ref} /></button>;
}
export function WordLine({ zh, py, g }: { zh: string; py?: string; g?: string }): ReactNode {
  return <span className="word-line"><ToneColored zh={zh} py={py} /> <span className="wl-py">{py}</span>{g ? <span className="wl-g"> · {g}</span> : null}</span>;
}
export const canSpeak = () => ttsAvailable();
