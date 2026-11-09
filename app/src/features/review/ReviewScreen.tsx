/** Spaced review: what's due, memory strength, and the coming week. */
import { useProgress, dueCount } from '../../state/progress';
import { strength } from '../../lib/srs';
import { DAY } from '../../lib/util';
import { useNow } from '../../state/hooks';
import { Icon } from '../../ui/Icon';
import { startReview, startWeak } from '../path/actions';

export function ReviewScreen() {
  const srs = useProgress(s => s.srs); useNow();
  const due = dueCount();
  const all = Object.values(srs).filter(c => c.s);
  const buckets = [0, 0, 0, 0]; all.forEach(c => { const st = strength(c); if (st) buckets[st - 1]++; });
  const names = ['Learning', 'Familiar', 'Strong', 'Mastered'];
  const fc: number[] = [];
  for (let d = 0; d < 7; d++) { const end = new Date(); end.setHours(23, 59, 59, 999); const t = end.getTime() + d * DAY; const t0 = d === 0 ? 0 : t - DAY; fc.push(all.filter(c => c.d <= t && c.d > t0).length); }
  const max = Math.max(1, ...fc);
  const dayName = (i: number) => (i === 0 ? 'Today' : new Date(Date.now() + i * DAY).toLocaleDateString(undefined, { weekday: 'short' }));
  return (
    <div className="stack gap-l">
      <section className="nextup">
        <div className="nu-hz" aria-hidden="true">复</div>
        <div className="eyebrow">Spaced review</div>
        <h2>{due ? `${due} word${due > 1 ? 's' : ''} due` : 'All caught up'}</h2>
        <p>{due ? 'Each review pushes a word deeper into long-term memory. Miss one and it comes back sooner.' : 'Nothing is due right now. Strengthen your weakest words, or come back later.'}</p>
        <div className="nu-row">
          {due ? <button className="btn invert" type="button" onClick={() => startReview()}><Icon name="review" />Review {Math.min(due, 20)}</button>
            : <button className="btn invert" type="button" onClick={startWeak}><Icon name="target" />Practise weak words</button>}
          {due > 20 && <button className="btn ghost-invert" type="button" onClick={() => startReview(40)}>Long session ({Math.min(due, 40)})</button>}
        </div>
      </section>
      <section className="card stack">
        <h2 className="card-title">Memory strength</h2>
        {all.length ? buckets.map((n, i) => (
          <div key={i} className="strength-row"><span className="small">{names[i]}</span><div className="goalbar"><i style={{ width: (100 * n) / all.length + '%', background: 'var(--jade)', opacity: 0.4 + i * 0.2 }} /></div><span className="small tnum">{n}</span></div>
        )) : <p className="muted">Words you learn in lessons appear here.</p>}
      </section>
      <section className="card stack">
        <h2 className="card-title">Coming up this week</h2>
        <div className="forecast">
          {fc.map((n, i) => <div key={i} className="fc-col"><span className="small tnum muted">{n}</span><div className={'fc-bar' + (i === 0 ? ' today' : '')} style={{ height: Math.max(3, (80 * n) / max) }} /><span className="small muted">{dayName(i)}</span></div>)}
        </div>
      </section>
      <button className="btn block" type="button" onClick={startWeak}><Icon name="target" />Practise weak words</button>
    </div>
  );
}
