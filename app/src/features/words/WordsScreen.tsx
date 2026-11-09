/** Every word you've learned, searchable, with details, audio, stroke order and example sentences. */
import { useEffect, useMemo, useState } from 'react';
import { useProgress } from '../../state/progress';
import { loadLevel, word, D } from '../../lib/data';
import { LEVEL_META } from '../../lib/course';
import { strength } from '../../lib/srs';
import { stripTones, isHan } from '../../lib/pinyin';
import { DAY } from '../../lib/util';
import type { LevelKey } from '../../lib/types';
import { Segmented, openSheet } from '../../ui/Primitives';
import { AudioButton, AudioPair, SentenceView, StrokeAnim, ToneColored } from '../../ui/Hanzi';
import { Icon } from '../../ui/Icon';
import { startSession } from '../player/session';

type Filter = 'all' | 'due' | 'weak' | 'strong';
export function WordsScreen() {
  const srs = useProgress(s => s.srs);
  const [q, setQ] = useState(''); const [f, setF] = useState<Filter>('all'); const [, setLoaded] = useState(0);
  const entries = useMemo(() => Object.entries(srs).filter(([, c]) => c.s), [srs]);
  useEffect(() => { Promise.all([...new Set(entries.map(([, c]) => c.l as LevelKey))].filter(k => k !== '0').map(k => loadLevel(k).catch(() => null))).then(() => setLoaded(x => x + 1)); }, [entries.length]);
  const now = Date.now(); const ql = q.trim().toLowerCase();
  let rows = entries.map(([w, c]) => ({ w, c, W: word(w) })).filter(r => r.W);
  if (f === 'due') rows = rows.filter(r => r.c.d <= now);
  if (f === 'weak') rows = rows.filter(r => r.c.x >= 1 || r.c.i < 2);
  if (f === 'strong') rows = rows.filter(r => r.c.i >= 10);
  if (ql) rows = rows.filter(r => r.w.includes(q.trim()) || stripTones(r.W!.py).replace(/\s/g, '').includes(ql.replace(/\s/g, '')) || (r.W!.g + ' ' + r.W!.en).toLowerCase().includes(ql));
  rows.sort((a, b) => b.c.n + b.c.x - (a.c.n + a.c.x));
  return (
    <div className="stack">
      <div className="section-title"><h2>Words</h2><span className="small muted tnum">{entries.length} learned</span></div>
      <input className="search" type="search" placeholder="Search hanzi, pinyin or English" aria-label="Search words" value={q} onChange={e => setQ(e.target.value)} />
      <Segmented label="Filter" value={f} onChange={setF} options={[{ v: 'all', label: 'All' }, { v: 'due', label: 'Due' }, { v: 'weak', label: 'Weak' }, { v: 'strong', label: 'Strong' }]} />
      <div className="list">
        {!rows.length && <div className="li static muted">{entries.length ? 'No words match.' : 'Words you learn appear here. Start your first lesson on the Learn tab.'}</div>}
        {rows.slice(0, 300).map(r => {
          const st = strength(r.c);
          return (
            <button key={r.w} className="li" type="button" onClick={() => openWord(r.w)}>
              <span className="lz hz">{r.w}</span>
              <div className="grow"><div><b>{r.W!.py}</b> <span className="muted small">{LEVEL_META[r.c.l as LevelKey]?.short}</span></div><div className="small muted ellipsis">{r.W!.g}</div></div>
              <span className="strength" aria-label={`Strength ${st} of 4`}>{[1, 2, 3, 4].map(i => <i key={i} className={i <= st ? 'on' : ''} />)}</span>
            </button>
          );
        })}
      </div>
      {rows.length > 300 && <p className="small muted center-text">Showing 300 of {rows.length}. Search to narrow down.</p>}
    </div>
  );
}
export function openWord(zh: string) { openSheet({ title: zh, wide: true, body: close => <WordDetail zh={zh} close={close} /> }); }
function WordDetail({ zh, close }: { zh: string; close: () => void }) {
  const W = word(zh); const c = useProgress.getState().srs[zh];
  if (!W) return null;
  const u = D.levels[W.l]?.units.find(x => x.words.includes(zh));
  const sents = u ? (u.sentences || []).filter(s => s.t.includes(zh)).slice(0, 3) : [];
  return (
    <div className="stack">
      <div className="bigword"><ToneColored zh={W.zh} py={W.py} className="bw-hz" /><div className="bw-py">{W.py}</div><div className="bw-g">{W.g}</div></div>
      <div className="row center"><AudioPair text={W.zh} big /></div>
      {W.en && W.en !== W.g && <p className="muted small center-text">{W.en}</p>}
      {[...zh].every(isHan) && <div className="row center">{[...zh].map((ch, i) => <StrokeAnim key={i} ch={ch} size={96} />)}</div>}
      {sents.length > 0 && <div className="notecard"><div className="eyebrow">In sentences</div>{sents.map((s, i) => <div key={i} className="exline"><div className="grow"><SentenceView s={s} /><div className="trans">{s.en}</div></div><AudioButton text={s.t.join('')} /></div>)}</div>}
      {c?.s && <p className="small muted">{LEVEL_META[c.l as LevelKey]?.name} · reviewed {c.n}× · {c.x} miss{c.x === 1 ? '' : 'es'} · next review {c.d <= Date.now() ? 'now' : 'in ' + Math.max(1, Math.round((c.d - Date.now()) / DAY)) + ' day(s)'}</p>}
      {[...zh].every(isHan) && [...zh].length <= 3 && <button className="btn" type="button" onClick={() => { close(); setTimeout(() => startSession({ title: 'Write', mode: 'practice', load: async () => [{ type: 'write', w: zh, words: [zh], level: W.l }] }), 200); }}><Icon name="pen" />Practise writing</button>}
    </div>
  );
}
