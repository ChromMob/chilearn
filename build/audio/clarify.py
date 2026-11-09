"""Clearer tones for word and sentence clips: pull each syllable's pitch contour toward its citation tone shape.

The neural voice speaks with natural, compressed pitch movement, so tones can be hard to hear for learners. Each clip
is split into syllables (CTC alignment with the speech model + unvoiced gaps), and the pitch inside each syllable is
blended with the textbook contour of its tone (after tone sandhi: 3-3 -> 2-3, 一/不 changes; non-final 3rd tones as
half-thirds; neutral tones left as spoken). The WORLD vocoder keeps the voice's own consonants and vowels.
"""
import os, re, sys, subprocess
import numpy as np, pyworld as pw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '../asr'))
import tts_lib as L
from pypinyin import lazy_pinyin, Style
STEP = 2.6   # semitones per Chao level (5 levels ~ 10.4 st range)
SHAPES = {1: [(0, 5), (1, 5)], 2: [(0, 2.6), (0.3, 2.3), (1, 5)], 3: [(0, 2.2), (0.6, 1), (1, 3.0)], 4: [(0, 5), (1, 1.2)], 'half3': [(0, 2.2), (1, 1.0)]}

def readings(text):
    """Toned syllables in context with sandhi applied, as (char, tone or 0 for neutral/unknown, final_in_phrase)."""
    chars = [c for c in text if re.match(r'[㐀-鿿]', c)]
    py = lazy_pinyin(''.join(chars), style=Style.TONE3, neutral_tone_with_five=True)
    tones = [int(p[-1]) if p[-1:].isdigit() else 0 for p in py]
    tones = [0 if t == 5 else t for t in tones]
    # phrase-final positions: before punctuation or at the end
    final = []; k = 0
    for i, c in enumerate(text):
        if re.match(r'[㐀-鿿]', c):
            nxt = text[i + 1:i + 2]
            final.append(nxt == '' or not re.match(r'[㐀-鿿]', nxt)); k += 1
    out = tones[:]
    for i in range(len(chars) - 1):
        n = tones[i + 1]
        if chars[i] == '一' and tones[i] == 1 and n: out[i] = 2 if n == 4 else 4
        if chars[i] == '不' and tones[i] == 4 and n == 4: out[i] = 2
        if tones[i] == 3 and n == 3: out[i] = 2
    if chars and chars[-1] == '一': out[-1] = 1
    return list(zip(chars, out, final))

def shape(tone, final, x):
    s = SHAPES['half3' if tone == 3 and not final else tone]
    return np.interp(x, [p[0] for p in s], [p[1] for p in s])

_ctc = None
def syllable_starts(x16, chars):
    global _ctc
    from ctc import CTC, ctc_align
    if _ctc is None: _ctc = CTC()
    lp = _ctc.logprobs(x16); ids = [_ctc.encode(c) for c in chars]
    first = ctc_align(lp, sum(ids, [])); fd = len(x16) / 16000 / lp.shape[0]; out = []; k = 0
    for i in ids: out.append(first[k] * fd); k += len(i)
    return out

def to16(x, sr):
    n = int(len(x) * 16000 / sr); X = np.fft.rfft(x)
    return (np.fft.irfft(X[:n // 2 + 1], n) * (n / len(x))).astype(np.float32)

def clarify(x, sr, text, alpha=0.7, mid=None, step=STEP):
    an = analyze(x, sr, text, mid, step)
    return (x, None) if an is None else (synth(an, alpha), (an['syl'], an['edges']))

def analyze(x, sr, text, mid=None, step=STEP):
    syl = readings(text)
    if not syl: return None
    x64 = x.astype(np.float64)
    f0, t = pw.dio(x64, sr, frame_period=5.0, f0_floor=70, f0_ceil=500); f0 = pw.stonemask(x64, f0, t, sr)
    sp = pw.cheaptrick(x64, f0, t, sr); ap = pw.d4c(x64, f0, t, sr)
    v = f0 > 0
    if v.sum() < 10: return None
    starts = syllable_starts(to16(x, sr), [c for c, _, _ in syl])
    # syllable boundaries: the quietest point (the next consonant) near where the speech model places the next
    # syllable; its estimate tends to come early, so search a little more forward than back
    hop = int(0.005 * sr); en = np.array([np.sqrt(np.mean(x64[i:i + 2 * hop] ** 2)) + 1e-6 for i in range(0, len(x64) - 2 * hop, hop)])
    en = np.convolve(np.log(en), np.ones(5) / 5, mode='same'); te = np.arange(len(en)) * 0.005 + 0.005
    bounds = []; prev = -1.0
    for s in starts[1:]:
        m = (te > max(prev + 0.06, s - 0.06)) & (te < s + 0.16)
        b = float(te[m][np.argmin(en[m])]) if m.any() else s
        bounds.append(b); prev = b
    edges = [-1.0] + bounds + [1e9]
    st = np.zeros_like(f0); st[v] = 12 * np.log2(f0[v] / np.median(f0[v]))
    # speaker mid: the clip median corrected for the tones it contains
    lv = [np.mean(shape(tn, fin, np.linspace(0, 1, 9))) for _, tn, fin in syl if tn]
    med = float(np.median(f0[v])); mid = mid or med / 2 ** (((np.mean(lv) if lv else 3) - 3) * step / 12)
    return dict(x=x, sr=sr, f0=f0, t=t, sp=sp, ap=ap, v=v, st=st, syl=syl, edges=edges, med=med, mid=mid, step=step)

def synth(an, alpha):
    x, sr, f0, t, sp, ap, v, st, syl, edges, med, mid, step = (an[k] for k in ('x', 'sr', 'f0', 't', 'sp', 'ap', 'v', 'st', 'syl', 'edges', 'med', 'mid', 'step'))
    target = st.copy(); has = np.zeros(len(f0), bool)
    for i, (c, tn, fin) in enumerate(syl):
        idx = np.where(v & (t >= edges[i]) & (t < edges[i + 1]))[0]
        if not tn or len(idx) < 4: continue
        # voiced run(s) of this syllable: use the longest
        runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1); r = max(runs, key=len)
        if len(r) < 4: continue
        xs = (t[r] - t[r[0]]) / max(1e-6, t[r[-1]] - t[r[0]])
        tpl = (shape(tn, fin, xs) - 3) * step + 12 * np.log2(mid / med)
        target[r] = alpha * tpl + (1 - alpha) * st[r]; has[r] = True
    # smooth joins (25 ms) inside voiced stretches
    out = target.copy(); k = 3
    for i in np.where(v)[0]:
        lo, hi = max(0, i - k), min(len(f0), i + k + 1); w = v[lo:hi]
        out[i] = np.mean(target[lo:hi][w])
    f0n = np.where(v, med * 2 ** (out / 12), 0.0)
    y = pw.synthesize(f0n, sp, ap, sr, frame_period=5.0).astype(np.float32)
    y *= (np.abs(x).max() / (np.abs(y).max() + 1e-9))
    return y[:len(x)]
