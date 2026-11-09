"""Second pass over clips that failed verification in gen.py.

For each failed word or sentence, in order, stopping at the first take that passes:
  1. re-check the existing clip with a second, independent recogniser (Paraformer) and with harmless character
     variants (的/得/地, 他/她/它) ignored;
  2. other takes in the same voice (other phrasings for words, other speeds for sentences);
  3. other Kokoro voices of the same gender.
A take passes when either recogniser hears exactly the right tone-marked syllables. Results go to repairs.jsonl
(resumable; pack.py prefers a passing repair over the original). Clips that never pass stay flagged as unverified,
and the app plays the device voice for them instead.
Usage: python3 repair.py [--workers 4] [--limit N]"""
import hashlib, json, os, subprocess, sys, time
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen as G
REPAIRS = os.path.join(HERE, 'repairs.jsonl')
ALT = {'f': [4, 5, 8, 6, 7, 10, 12],   # zf_002, zf_003, zf_006, zf_004, zf_005, zf_008, zf_018
       'm': [60, 61, 62, 63, 64]}      # zm_011 … zm_015

def init():
    global L, tts, r1, r2, sr
    G.init(); L, tts, r1, sr = G.L, G.tts, G.rec, G.sr
    r2 = L.asr2(1)

def synth(text, sid, speed=1.0):
    a = tts.generate(text, sid=sid, speed=speed)
    return L.trim(np.array(a.samples, dtype=np.float32), a.sample_rate)

def err_of(ref, clip):
    g = np.zeros(int(0.15 * sr), dtype=np.float32); x = np.concatenate([g, clip, g]); best = 9.0
    for rec in (r1, r2):
        best = min(best, L.match_err(ref, L.transcribe(rec, x, sr)))
        if best == 0: break
    return best

def load(fn):
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(G.CACHE, fn), '-f', 'f32le', '-ac', '1', '-ar', str(sr), 'pipe:'], capture_output=True).stdout
    return L.trim(np.frombuffer(pcm, dtype=np.float32).copy(), sr)

def word_takes(w, sid, first):
    after = lambda pre, full: L.extract_after_pause(synth(full, sid), sr, len(synth(pre, sid)) / sr)
    takes = [] if first else [('iso', lambda: synth(w + '。', sid))]
    takes += [('carrier', lambda: after('请听：', '请听：' + w + '。'))]
    if first: takes += [('repeat', lambda: after(w + '，', w + '，' + w + '。')), ('slow', lambda: synth(w + '。', sid, 0.9))]
    return takes

def sent_takes(t, sid, first):
    return [(f'@{s}', (lambda s=s: synth(t, sid, s))) for s in ((1.0, 0.95, 1.05, 0.9) if first else (1.0, 0.95))]

def work(r):
    t0 = time.time(); key = r['key']; text = key.split('|')[0]; voice = 'm' if key.endswith('|m') else 'f'
    ref = G.num_to_han(text)
    try:
        e = err_of(ref, load(r['file']))
        if e == 0: return {**r, 'ok': True, 'method': r['method'] + '+v2', 'err': 0.0, 'secs': round(time.time() - t0, 2)}
        best = e
        for sid in [G.VOICES[voice]] + ALT[voice]:
            first = sid == G.VOICES[voice]
            for name, fn in (word_takes(text, sid, first) if r['kind'] == 'word' else sent_takes(text, sid, first)):
                clip = fn()
                if clip is None or len(clip) < int(0.15 * sr): continue
                e = err_of(ref, clip); best = min(best, e)
                if e == 0:
                    f = hashlib.sha1(f'{key}#{sid}{name}'.encode()).hexdigest()[:16] + '.mp3'
                    with open(os.path.join(G.CACHE, f), 'wb') as out: out.write(G.mp3(clip))
                    return {**r, 'ok': True, 'method': f'repair:{name}', 'speaker': sid, 'err': 0.0, 'file': f,
                            'dur': round(len(clip) / sr, 3), 'secs': round(time.time() - t0, 2)}
        return {'key': key, 'ok': False, 'tried': True, 'err': round(best, 3), 'secs': round(time.time() - t0, 2)}
    except Exception as ex:
        return {'key': key, 'ok': False, 'tried': True, 'error': str(ex)[:200]}

if __name__ == '__main__':
    args = sys.argv[1:]
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 4
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else None
    rs = {}
    for line in open(G.RESULTS):
        try: x = json.loads(line)
        except Exception: continue
        if x.get('file'): rs[x['key']] = x
    done = set()
    if os.path.exists(REPAIRS):
        for line in open(REPAIRS):
            try: done.add(json.loads(line)['key'])
            except Exception: pass
    todo = [x for x in rs.values() if not x['ok'] and x['kind'] in ('word', 'sent') and x['key'] not in done]
    if limit: todo = todo[:limit]
    print(f'{len(todo)} failed clips to repair ({len(done)} already tried)', flush=True)
    t0 = time.time(); n = fixed = 0
    with Pool(workers, initializer=init) as pool, open(REPAIRS, 'a') as out:
        for x in pool.imap_unordered(work, todo, chunksize=1):
            out.write(json.dumps(x, ensure_ascii=False) + '\n'); out.flush()
            n += 1; fixed += x['ok']
            if n % 50 == 0 or n == len(todo):
                m = (time.time() - t0) / 60
                print(f'{n}/{len(todo)} tried, {fixed} fixed ({100 * fixed // max(n, 1)}%), {m:.1f} min, ~{m / n * (len(todo) - n):.0f} min left', flush=True)
