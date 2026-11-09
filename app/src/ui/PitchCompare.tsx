/** Per-syllable pitch lines: the learner's voice against the course voice, so tone differences are visible. */
import type { SylPitch, Verdict } from '../lib/asr';

const W = 54, H = 46, RANGE = 7;
const y = (s: number) => H / 2 - (Math.max(-RANGE, Math.min(RANGE, s)) * (H / 2 - 5)) / RANGE;
const line = (a: number[]) => a.map((s, k) => `${((k / (a.length - 1)) * (W - 10) + 5).toFixed(1)},${y(s).toFixed(1)}`).join(' ');

export function PitchCompare({ v, pitch }: { v: Verdict[]; pitch?: SylPitch[] }) {
  if (!pitch || !pitch.some(p => p.l)) return null;
  const hasRef = pitch.some(p => p.r);
  return (
    <div className="pitch-cmp">
      <div className="pc-row" role="img" aria-label={hasRef ? 'Your pitch on each syllable compared with the course voice' : 'Your pitch on each syllable'}>
        {v.map((x, i) => (
          <figure key={i} className={'pc ' + x.mark}>
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
              <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="pc-mid" />
              {pitch[i]?.r && <polyline points={line(pitch[i].r!)} className="pc-ref" />}
              {pitch[i]?.l && <polyline points={line(pitch[i].l!)} className="pc-you" />}
            </svg>
            <figcaption className="hz">{x.ch}</figcaption>
          </figure>
        ))}
      </div>
      <div className="pc-legend small muted">{hasRef && <><i className="k ref" />course voice</>}<i className="k you" />you</div>
    </div>
  );
}
