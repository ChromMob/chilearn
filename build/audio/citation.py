"""Clear citation tones for single syllables: cut the voice's trailing breath, then impose a wide textbook contour on the
vowel with Praat's overlap-add resynthesis (no vocoder noise), with each tone's natural length."""
import numpy as np, parselmouth
from parselmouth.praat import call
# semitones relative to the speaker's mid pitch, over the voiced part of the syllable (0..1)
SHAPES = {1: [(0, 4.6), (1, 4.4)],
          2: [(0, 0.0), (0.3, -0.6), (1, 6.8)],
          3: [(0, -1.2), (0.45, -6.5), (0.7, -6.5), (1, 0.8)],
          4: [(0, 7.0), (1, -5.0)]}
LENGTH = {1: 1.3, 2: 1.35, 3: 1.6, 4: 1.05}   # vowel lengthening: clear, unhurried citation tones
def frames_db(x, sr, hop=0.005, win=0.02):
    h, w = int(hop * sr), int(win * sr)
    return np.array([10 * np.log10(1e-12 + np.mean(x[i:i + w] ** 2)) for i in range(0, max(1, len(x) - w), h)]), h
def main_region(x, sr, floor_db=42, gap=0.03):
    """Sample range of the syllable itself: the loud region around the peak, ending where the level drops >floor_db
    below the peak for at least `gap` seconds (drops the trailing breath/creak the voice adds after a full stop)."""
    e, h = frames_db(x, sr); pk = int(np.argmax(e)); thr = e[pk] - floor_db; g = int(gap / 0.005)
    def walk(step):
        i = pk; quiet = 0; last = pk
        while 0 <= i + step < len(e):
            i += step
            if e[i] < thr: quiet += 1
            else: quiet = 0; last = i
            if quiet >= g: break
        return last
    a, b = walk(-1), walk(1)
    return max(0, a * h), min(len(x), (b + 4) * h + int(0.02 * sr))
def voiced_run(x, sr, max_gap=0.02):
    """Start and end (s) of the voiced stretch around the loudest point (gaps up to max_gap bridged)."""
    p = parselmouth.Sound(x, sr).to_pitch(0.005, 75, 600); f = p.selected_array['frequency']; ts = p.xs()
    v = f > 0
    if v.sum() < 8: return 0.0, 0.0
    e, h = frames_db(x, sr); pk = int(np.argmax(e)) * h / sr
    runs = []; i = 0; g = int(max_gap / 0.005)
    while i < len(v):
        if not v[i]: i += 1; continue
        j = i
        while True:
            k = j + 1
            while k < len(v) and not v[k] and k - j <= g: k += 1
            if k < len(v) and v[k] and k - j <= g + 1: j = k
            else: break
        runs.append((ts[i], ts[j])); i = j + 1
    best = min(runs, key=lambda r: 0 if r[0] <= pk <= r[1] else min(abs(pk - r[0]), abs(pk - r[1])) + 10 - (r[1] - r[0]))
    return best
def fade(y, sr, ms_in=8, ms_out=40):
    y = y.copy(); n, m = int(ms_in * sr / 1000), int(ms_out * sr / 1000)
    y[:n] *= np.linspace(0, 1, n); y[-m:] *= np.cos(np.linspace(0, np.pi / 2, m)) ** 2
    return y
def retone2(x, sr, tone, mid, shape_scale=1.0):
    a, b = main_region(x, sr); x = x[a:b].astype(np.float64)
    t0, t1 = voiced_run(x, sr)
    if t1 - t0 < 0.08: return None
    # end the syllable shortly after its voicing stops: anything later is breath or creak from the voice model
    x = fade(x[:min(len(x), int((t1 + 0.04) * sr))], sr, 5, 30)
    snd = parselmouth.Sound(x, sr)
    manip = call(snd, 'To Manipulation', 0.005, 75, 600)
    pt = call(manip, 'Extract pitch tier'); call(pt, 'Remove points between', 0, snd.duration)
    pts = SHAPES[tone]
    for k in np.linspace(0, 1, 41):
        st = np.interp(k, [p[0] for p in pts], [p[1] for p in pts]) * shape_scale
        call(pt, 'Add point', t0 + k * (t1 - t0), mid * 2 ** (st / 12))
    call([pt, manip], 'Replace pitch tier')
    L = LENGTH[tone]
    if abs(L - 1) > 0.01:
        dt = call(manip, 'Extract duration tier')
        v0 = t0 + min(0.06, 0.25 * (t1 - t0))   # leave the voiced initial (m, n, l, r) at its natural length
        call(dt, 'Add point', v0 - 0.001, 1.0); call(dt, 'Add point', v0 + 0.02, L); call(dt, 'Add point', t1 - 0.01, L)
        call(dt, 'Add point', min(snd.duration, t1 + 0.02), 1.0)
        call([dt, manip], 'Replace duration tier')
    y = call(manip, 'Get resynthesis (overlap-add)').values[0]
    y = fade(y, sr, 5, 30); y = y / max(1e-6, np.abs(y).max()) * 0.85
    return y.astype(np.float32)
