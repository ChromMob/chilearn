"""Generate and verify every clip in jobs.json. Resumable: results are appended to results.jsonl, MP3s cached by key hash.
Usage: python3 gen.py [--limit N] [--workers 4]"""
import hashlib, json, os, subprocess, sys, time
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
RESULTS = os.path.join(HERE, 'results.jsonl')
VOICES = {'f': 3, 'm': 59}   # kokoro v1.1-zh: zf_001 (female), zm_010 (male)
VOICE_MID = 232              # zf_001 mid pitch (Hz), used for exact tone contours

CN = dict(zip('0123456789', '零一二三四五六七八九'))
def num_to_han(s):
    import re
    def f(m):
        x = m.group(0); n = int(x)
        if 0 < n < 100 and len(x) <= 2:
            t, o = divmod(n, 10)
            return (CN[str(t)] if t > 1 else '') + ('十' if t >= 1 else '') + (CN[str(o)] if o else ('' if t else '零'))
        return ''.join(CN[d] for d in x)
    return re.sub(r'\d+', f, s)

def init():
    global L, tts, rec, ctx, sr
    import tts_lib as L_
    L = L_; tts = L.kokoro(1); rec = L.asr(1)
    a = tts.generate('下一个词是，', sid=VOICES['f'], speed=1.0)
    sr = a.sample_rate; ctx = L.trim(np.array(a.samples, dtype=np.float32), sr)

def synth(text, voice='f', speed=1.0):
    a = tts.generate(text, sid=VOICES[voice], speed=speed)
    return L.trim(np.array(a.samples, dtype=np.float32), a.sample_rate)

def toned(s): return L.py_seq(num_to_han(s))
def asr_toned(clip, with_ctx=False):
    g = np.zeros(int(0.15 * sr), dtype=np.float32)
    x = np.concatenate([ctx, g, clip, g]) if with_ctx else clip
    return L.py_seq(L.transcribe(rec, x, sr))

def mp3(clip):
    pcm = np.concatenate([np.zeros(int(0.03 * sr), np.float32), clip, np.zeros(int(0.05 * sr), np.float32)])
    p = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', 'pipe:', '-c:a', 'libmp3lame', '-b:a', '40k', '-ar', '24000', '-f', 'mp3', 'pipe:'], input=pcm.tobytes(), capture_output=True)
    return p.stdout

def do_sent(j):
    ref = toned(j['text']); best = None
    for speed in (1.0, 0.95, 1.05):
        clip = synth(j['text'], j['voice'], speed)
        hyp = asr_toned(clip); err = L.seq_err(ref, hyp)
        if best is None or err < best[0]: best = (err, clip, f'sent@{speed}')
        if err == 0: break
    return best[1], best[0] == 0, best[2], round(best[0], 3)

def do_word(j):
    ref = toned(j['text']); n = len(ref); best = None
    cands = [('isolated', lambda: synth(j['text'] + '。')),
             ('repeat', lambda: L.extract_after_pause(synth(j['text'] + '，' + j['text'] + '。'), sr, len(synth(j['text'] + '，')) / sr)),
             ('slow', lambda: synth(j['text'] + '。', speed=0.9)),
             ('carrier', lambda: L.extract_after_pause(synth('请听：' + j['text'] + '。'), sr, len(synth('请听：')) / sr))]
    for name, fn in cands:
        clip = fn()
        if clip is None or len(clip) < int(0.15 * sr): continue
        h1 = asr_toned(clip); h2 = asr_toned(clip, True)[-n:]
        err = min(L.seq_err(ref, h1), L.seq_err(ref, h2))
        if best is None or err < best[0]: best = (err, clip, name)
        if err == 0: break
    if best is None: return None, False, 'none', 1
    return best[1], best[0] == 0, best[2], round(best[0], 3)

def do_syl(j):
    if 1 <= j['tone'] <= 4:
        first = None
        for speed, stretch in ((1.0, {3: 1.25, 4: 0.9}.get(j['tone'], 1.0)), (0.85, {3: 1.35, 4: 1.0, 2: 1.15, 1: 1.1}[j['tone']])):
            base = synth(j['src'] + '。', speed=speed)
            clip = L.retone(base, sr, j['tone'], VOICE_MID, stretch=stretch)
            if clip is None: continue
            first = first if first is not None else clip
            if L.classify_tone(L.pitch_track(clip, sr), VOICE_MID) == j['tone']: return clip, True, 'retone', 0
        return (first if first is not None else synth(j['src'] + '。')), False, 'retone', 1
    return synth(j['src'] + '。'), True, 'neutral', 0

def work(j):
    t0 = time.time()
    try:
        clip, ok, method, err = {'sent': do_sent, 'word': do_word, 'syl': do_syl}[j['kind']](j)
        if clip is None: return {'key': j['key'], 'ok': False, 'method': method, 'error': 'no audio'}
        data = mp3(clip); fn = hashlib.sha1(j['key'].encode()).hexdigest()[:16] + '.mp3'
        with open(os.path.join(CACHE, fn), 'wb') as f: f.write(data)
        return {'key': j['key'], 'pack': j['pack'], 'kind': j['kind'], 'ok': bool(ok), 'method': method, 'err': err, 'file': fn, 'dur': round(len(clip) / sr, 3), 'secs': round(time.time() - t0, 2)}
    except Exception as e:
        return {'key': j['key'], 'ok': False, 'method': 'exception', 'error': str(e)[:200]}

if __name__ == '__main__':
    args = sys.argv[1:]
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else None
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 4
    jobs = json.load(open(os.path.join(HERE, 'jobs.json')))
    done = set()
    if os.path.exists(RESULTS):
        for line in open(RESULTS):
            try: r = json.loads(line); done.add(r['key']) if r.get('file') else None
            except Exception: pass
    order = {'syl': 0, 'word': 1, 'sent': 2}
    # earliest levels first so the start of the course is ready soonest
    lvl = lambda p: 0 if p == 'shared' else {'1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'a': 7}[p[1] if p[0] == 'h' else 'a']
    todo = sorted([j for j in jobs if j['key'] not in done], key=lambda j: (lvl(j['pack']), order[j['kind']]))
    if limit: todo = todo[:limit]
    print(f'{len(todo)} clips to generate ({len(done)} already done)', flush=True)
    t0 = time.time(); n = 0; okc = 0
    with Pool(workers, initializer=init) as pool, open(RESULTS, 'a') as out:
        for r in pool.imap_unordered(work, todo, chunksize=4):
            out.write(json.dumps(r, ensure_ascii=False) + '\n'); out.flush()
            n += 1; okc += r.get('ok', False)
            if n % 200 == 0 or n == len(todo):
                el = time.time() - t0
                print(f'{n}/{len(todo)} done, {okc} verified ({100*okc/n:.0f}%), {el/60:.1f} min elapsed, ~{el/n*(len(todo)-n)/60:.0f} min left', flush=True)
