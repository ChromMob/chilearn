"""Shared helpers: load TTS engines and the verification recognizer (sherpa-onnx), normalise Chinese text, score clips."""
import os, re, unicodedata
import numpy as np
import sherpa_onnx

MODELS = os.environ.get('LX_MODELS', '/tmp/claude-0/-home-user/463c37e1-10cd-5a37-8302-42586a02b14f/scratchpad/tts/models')

def kokoro(threads=1):
    d = f'{MODELS}/kokoro-multi-lang-v1_1'
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=f'{d}/model.onnx', voices=f'{d}/voices.bin', tokens=f'{d}/tokens.txt',
            data_dir=f'{d}/espeak-ng-data', dict_dir=f'{d}/dict', lexicon=f'{d}/lexicon-us-en.txt,{d}/lexicon-zh.txt'),
        num_threads=threads), rule_fsts=f'{d}/date-zh.fst,{d}/phone-zh.fst,{d}/number-zh.fst', max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)

def melo(threads=1):
    d = f'{MODELS}/vits-melo-tts-zh_en'
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{d}/model.onnx', lexicon=f'{d}/lexicon.txt', tokens=f'{d}/tokens.txt', dict_dir=f'{d}/dict'),
        num_threads=threads), rule_fsts=f'{d}/date.fst,{d}/phone.fst,{d}/number.fst,{d}/new_heteronym.fst', max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)

def asr(threads=2):
    d = f'{MODELS}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(model=f'{d}/model.int8.onnx', tokens=f'{d}/tokens.txt', num_threads=threads, use_itn=False, language='zh')

def asr2(threads=2):
    """Second, independent recognizer (Paraformer) used as a second opinion on clips SenseVoice rejects."""
    d = f'{MODELS}/sherpa-onnx-paraformer-zh-2024-03-09'
    return sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=f'{d}/model.int8.onnx', tokens=f'{d}/tokens.txt', num_threads=threads)

HAN = re.compile(r'[㐀-鿿]')
def han(s): return ''.join(HAN.findall(s))

def transcribe(rec, samples, sr):
    st = rec.create_stream(); st.accept_waveform(sr, samples); rec.decode_stream(st); return st.result.text

def cer(ref, hyp):
    r, h = han(ref), han(hyp)
    if not r: return 0.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / len(r)

def trim(samples, sr, thresh=0.01, pad=0.06):
    """Trim leading/trailing silence, keep a short pad."""
    a = np.abs(samples); idx = np.where(a > thresh)[0]
    if not len(idx): return samples
    s = max(0, idx[0] - int(pad * sr)); e = min(len(samples), idx[-1] + int(pad * sr))
    return samples[s:e]

from pypinyin import lazy_pinyin, Style
def py_seq(s, tones=True):
    """Toned (or toneless) pinyin syllables of the Chinese characters in s, using context-aware pypinyin with tone sandhi off."""
    h = han(s)
    if not h: return []
    return lazy_pinyin(h, style=Style.TONE3 if tones else Style.NORMAL, neutral_tone_with_five=True)
def seq_err(ref, hyp):
    if not ref: return 0.0
    d = list(range(len(hyp) + 1))
    for i in range(1, len(ref) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(hyp) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (ref[i - 1] != hyp[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(hyp)] / len(ref)
# characters that are pronounced the same in context and that recognisers pick between by grammar/meaning, not sound
EQUIV = [set('的得地'), set('他她它'), set('哟呦')]
def align_norm(ref, hyp):
    """hyp's Chinese characters, with interchangeable characters (的/得/地, 他/她/它) replaced by the reference's where they align."""
    import difflib
    r, h = han(ref), han(hyp); out = list(h)
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, r, h, autojunk=False).get_opcodes():
        if op == 'replace' and i2 - i1 == j2 - j1:
            for k in range(i2 - i1):
                a, b = r[i1 + k], h[j1 + k]
                if any(a in g and b in g for g in EQUIV): out[j1 + k] = a
    return ''.join(out)
def match_err(ref, hyp):
    """Toned-syllable error between the reference text and a transcript, ignoring harmless character choices."""
    return seq_err(py_seq(ref), py_seq(align_norm(ref, hyp)))
def pron_err(ref, hyp):
    """(toned syllable error, toneless syllable error) between what should be said and what was recognised."""
    return seq_err(py_seq(ref), py_seq(hyp)), seq_err(py_seq(ref, False), py_seq(hyp, False))

def frame_energy(s, sr, hop=0.01):
    n = int(hop * sr); m = len(s) // n
    return np.sqrt(np.mean(s[: m * n].reshape(m, n) ** 2, axis=1)) if m else np.zeros(0)

def extract_after_pause(full, sr, approx_end, search=(0.6, 1.8), min_gap=0.06):
    """Find the pause that ends the carrier (near approx_end seconds) and return the audio after it."""
    e = frame_energy(full, sr); hop = 0.01
    if not len(e): return None
    thr = max(0.004, np.percentile(e, 30) * 0.6)
    lo, hi = int(approx_end * search[0] / hop), min(len(e) - 5, int(approx_end * search[1] / hop))
    best, best_len, i = None, 0, lo
    while i < hi:
        if e[i] < thr:
            j = i
            while j < len(e) and e[j] < thr: j += 1
            if (j - i) * hop >= min_gap and (j - i) > best_len: best, best_len = (i, j), j - i
            i = j
        else: i += 1
    if not best: return None
    start = int(max(best[0], best[1] - 4) * hop * sr)  # keep 40 ms of the gap as lead-in
    return trim(full[start:], sr)

# ---------- pitch-based tone check (port of app/src/lib/pitch.ts) ----------
def yin(buf, sr):
    half = len(buf) // 2; min_tau = int(sr / 450); max_tau = min(half - 2, int(sr / 65))
    d = np.array([np.sum((buf[:half] - buf[t:t + half]) ** 2) for t in range(max_tau + 2)], dtype=np.float64)
    cm = np.ones_like(d); run = np.cumsum(d[1:]); cm[1:] = d[1:] * np.arange(1, len(d)) / np.where(run == 0, 1, run)
    for tau in range(min_tau, max_tau + 1):
        if cm[tau] < 0.18:
            while tau + 1 <= max_tau and cm[tau + 1] < cm[tau]: tau += 1
            a, b, c = cm[tau - 1], cm[tau], cm[tau + 1]; den = a - 2 * b + c
            return sr / (tau + ((a - c) / (2 * den) if den else 0)), 1 - b
    return 0.0, 0.0

def pitch_track(s, sr, win=0.042, hop=0.01):
    if sr > 30000: s, sr = s[::2], sr // 2
    n, h = int(win * sr), int(hop * sr); out = []
    for i in range(0, len(s) - n, h):
        fr = s[i:i + n]; rms = np.sqrt(np.mean(fr ** 2))
        if rms < 0.02: continue
        f, conf = yin(fr, sr)
        if f and conf > 0.75: out.append((i / sr, f))
    return out

def classify_tone(track, cal_mid=None):
    if len(track) < 5: return 0
    f = np.array([x[1] for x in track]); t = np.array([x[0] for x in track]); med = np.median(f)
    s = 12 * np.log2(f / med); keep = np.abs(s) < 9; s, t = s[keep], t[keep]
    if len(s) < 5: return 0
    s = np.array([np.median(s[max(0, i - 2): i + 3]) for i in range(len(s))])
    cut = int(len(s) * 0.1); s, t = s[cut: len(s) - cut or None], t[cut: len(t) - cut or None]
    if len(s) < 4: return 0
    x = (t - t[0]) / max(1e-6, t[-1] - t[0])
    seg = lambda a, b: float(np.mean(s[(x >= a) & (x <= b)])) if np.any((x >= a) & (x <= b)) else 0.0
    start, end = seg(0, 0.2), seg(0.8, 1); mi = int(np.argmin(s)); minv, maxv, minx = s[mi], s.max(), x[mi]
    rng = maxv - minv; rel = 12 * np.log2(med / cal_mid) if cal_mid else 0; cal = cal_mid is not None
    fb, ra = start - minv, end - minv
    if rng < 1.8: return 3 if cal and rel < -2.5 else 1
    if fb >= 1.2 and ra >= 1.2 and 0.2 < minx < 0.85 and not (ra > 2.2 * fb and minx < 0.4): return 3
    if end - start >= 1.8: return 2
    if start - end >= 2.2: return 3 if cal and rel < -2 and rng < 4.5 and start < 2 else 4
    if cal and rel < -2.5: return 3
    return 1

# ---------- exact tone contours for single syllables (WORLD vocoder resynthesis) ----------
import pyworld as pw
CHAO = {1: [(0, 5), (1, 5)], 2: [(0, 3), (1, 5)], 3: [(0, 2.2), (0.55, 1), (1, 3.6)], 4: [(0, 5), (1, 1.2)]}
def chao_hz(v, mid): return mid * 2 ** ((v - 3) * 2.4 / 12)
def retone(s, sr, tone, mid, stretch=None):
    """Impose the citation contour of `tone` (1-4) on a syllable, keeping its consonant/vowel spectrum."""
    x = s.astype(np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=70, f0_ceil=500, frame_period=5.0)
    sp = pw.cheaptrick(x, f0, t, sr); ap = pw.d4c(x, f0, t, sr)
    voiced = np.where(f0 > 0)[0]
    if len(voiced) < 6: return None
    a, b = voiced[0], voiced[-1]
    if stretch and stretch != 1.0:  # lengthen/shorten the voiced part (3rd tone is longer, 4th shorter)
        n_new = max(6, int((b - a + 1) * stretch)); idx = np.linspace(a, b, n_new)
        def rs(M): return np.array([M[int(round(i))] for i in idx])
        sp = np.concatenate([sp[:a], rs(sp), sp[b + 1:]]); ap = np.concatenate([ap[:a], rs(ap), ap[b + 1:]])
        f0 = np.concatenate([f0[:a], np.full(n_new, 1.0), f0[b + 1:]]); b = a + n_new - 1
    pts = CHAO[tone]; n = b - a + 1; xs = np.linspace(0, 1, n)
    target = np.interp(xs, [p[0] for p in pts], [chao_hz(p[1], mid) for p in pts])
    new_f0 = f0.copy(); new_f0[a:b + 1] = np.where(f0[a:b + 1] > 0, target, 0)
    # keep unvoiced gaps inside the vowel voiced so the contour is continuous
    new_f0[a:b + 1] = target
    y = pw.synthesize(new_f0, np.ascontiguousarray(sp), np.ascontiguousarray(ap), sr, frame_period=5.0)
    y = y / max(1e-6, np.abs(y).max()) * 0.85
    return trim(y.astype(np.float32), sr)
