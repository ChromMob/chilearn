/** Draws the learner's pitch contour over the target tone shape. */
import { useEffect, useRef } from 'react';
import { TARGET_SHAPES, semitones, type Contour } from '../lib/pitch';
import { getProgress } from '../state/progress';

export function PitchCanvas({ contour, target, live }: { contour: Contour | null; target?: number; live?: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1; const w = canvas.clientWidth || 480, h = canvas.clientHeight || 180;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const g = canvas.getContext('2d'); if (!g) return; g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.documentElement); const col = (v: string) => cs.getPropertyValue(v).trim() || '#888';
      const pad = 18; const Y = (lv: number) => pad + ((5 - lv) * (h - 2 * pad)) / 4; const X = (x: number) => pad + x * (w - 2 * pad);
      g.strokeStyle = col('--line'); g.lineWidth = 1;
      for (let k = 1; k <= 5; k++) { g.beginPath(); g.moveTo(pad, Y(k)); g.lineTo(w - pad, Y(k)); g.stroke(); }
      g.fillStyle = col('--muted'); g.font = '11px system-ui, sans-serif'; g.fillText('high', 4, pad - 6); g.fillText('low', 4, h - 4);
      if (target && TARGET_SHAPES[target]) {
        g.setLineDash([6, 6]); g.strokeStyle = col('--t' + target); g.globalAlpha = 0.55; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); TARGET_SHAPES[target].forEach(([x, lv], i) => (i ? g.lineTo(X(x), Y(lv)) : g.moveTo(X(x), Y(lv)))); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
      }
      if (contour) {
        const cal = getProgress().voiceCal; const off = cal.n >= 3 ? semitones(contour.medHz, cal.mid) : 0;
        const lv = (s: number) => Math.max(0.6, Math.min(5.4, 3 + (s + off) / 3));
        g.strokeStyle = col('--ink'); g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); contour.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(lv(q.s))) : g.moveTo(X(q.x), Y(lv(q.s))))); g.stroke();
      }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(canvas);
    return () => ro.disconnect();
  }, [contour, target]);
  return <canvas ref={ref} className="pitch" aria-label={contour ? 'Your pitch contour compared with the target tone' : 'Target tone shape'} />;
}
