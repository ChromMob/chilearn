"""Single-syllable clips (tone drills and one-character words) with clear citation tones and clean endings.
The neural voice says isolated syllables with almost no tone movement and often adds a faint breath after them, so each
one is cut to its own voicing and given the textbook contour of its tone with Praat overlap-add (citation.py). A clip is
verified when the pitch tracker reads back the intended tone. Resumable; results in syllables.jsonl (pack.py uses them).
Usage: python3 syllables.py [--workers 4] [--limit N]"""
import hashlib, json, os, sys, time
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
CACHE = os.path.join(HERE, 'cache'); OUT = os.path.join(HERE, 'syllables.jsonl')
VOICE, MID = 3, 232   # kokoro zf_001 and its mid pitch (Hz)

def init():
    global L, G, C, tts, sr
    import tts_lib as L_, gen as G_, citation as C_
    L, G, C = L_, G_, C_; tts = L.kokoro(1); G.sr = sr = 24000

def base(ch, speed):
    a = tts.generate(ch + '。', sid=VOICE, speed=speed)
    return L.trim(np.array(a.samples, np.float32), a.sample_rate)

def clean_neutral(x):
    a, b = C.main_region(x, sr); x = x[a:b]; t0, t1 = C.voiced_run(x, sr)
    if t1 > t0: x = x[:min(len(x), int((t1 + 0.04) * sr))]
    y = C.fade(x.astype(np.float64), sr, 5, 30); return (y / max(1e-6, np.abs(y).max()) * 0.85).astype(np.float32)

def work(j):
    t0 = time.time()
    try:
        tone = j['tone']; ok = True; method = 'neutral'
        if 1 <= tone <= 4:
            first = None; ok = False
            for speed, scale in ((1.0, 1.0), (0.9, 1.0), (0.85, 1.0), (1.0, 1.15), (0.85, 1.25)):
                y = C.retone2(base(j['src'], speed), sr, tone, MID, scale)
                if y is None: continue
                first = y if first is None else first
                if L.classify_tone(L.pitch_track(y, sr), MID) == tone: ok = True; method = f'psola@{speed}x{scale}'; break
            y = y if ok else first
            if y is None: return {'key': j['key'], 'ok': False, 'error': 'no voiced part'}
            if not ok: method = 'psola-unverified'
        else:
            y = clean_neutral(base(j['src'], 1.0))
        data = G.mp3(y); fn = hashlib.sha1((j['key'] + '#psola').encode()).hexdigest()[:16] + '.mp3'
        open(os.path.join(CACHE, fn), 'wb').write(data)
        v = y[np.abs(y) > 0.01]
        return {'key': j['key'], 'pack': j['pack'], 'kind': 'syl', 'ok': ok, 'method': method, 'file': fn,
                'dur': round(len(y) / sr, 3), 'rms': float(np.sqrt(np.mean(v ** 2))) if len(v) else 0.0, 'secs': round(time.time() - t0, 2)}
    except Exception as e:
        return {'key': j['key'], 'ok': False, 'error': str(e)[:200]}

if __name__ == '__main__':
    a = sys.argv[1:]; workers = int(a[a.index('--workers') + 1]) if '--workers' in a else 4
    limit = int(a[a.index('--limit') + 1]) if '--limit' in a else None
    jobs = [j for j in json.load(open(os.path.join(HERE, 'jobs.json'))) if j['kind'] == 'syl']
    done = set()
    if os.path.exists(OUT):
        for line in open(OUT):
            try: r = json.loads(line); done.add(r['key']) if r.get('file') else None
            except Exception: pass
    todo = [j for j in jobs if j['key'] not in done][:limit]
    print(f'{len(todo)} syllables to make ({len(done)} done)', flush=True)
    t0 = time.time(); n = okc = 0
    with Pool(workers, initializer=init) as p, open(OUT, 'a') as f:
        for r in p.imap_unordered(work, todo):
            f.write(json.dumps(r, ensure_ascii=False) + '\n'); f.flush(); n += 1; okc += bool(r.get('ok'))
            if n % 100 == 0 or n == len(todo):
                el = time.time() - t0; print(f'{n}/{len(todo)} done, {okc} verified ({100*okc/n:.0f}%), {el/60:.1f} min, ~{el/n*(len(todo)-n)/60:.0f} min left', flush=True)
    print('SYLLABLES-DONE', flush=True)
