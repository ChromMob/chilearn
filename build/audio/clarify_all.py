"""Apply clearer tones (clarify.py) to every word and sentence clip, keeping only versions the recognisers still hear
exactly right. Tries full strength, then 0.7; otherwise the clip stays as it was. Resumable (clarified.jsonl);
pack.py prefers a clarified clip. Only clips whose final take is settled are processed (verified, or already through
repair.py), so re-run after repair.py finishes.
Usage: python3 clarify_all.py [--workers 4] [--limit N]"""
import hashlib, json, os, subprocess, sys, time
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen as G
OUT = os.path.join(HERE, 'clarified.jsonl'); SR = 24000; STRENGTHS = (1.0, 0.7)

def init():
    global L, C, r1, r2
    import tts_lib, clarify
    L, C = tts_lib, clarify; r1 = L.asr(1); r2 = L.asr2(1); G.sr = SR

def load(fn):
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(G.CACHE, fn), '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:'], capture_output=True)
    return np.frombuffer(p.stdout, np.float32).copy()

def heard_ok(text, y):
    g = np.zeros(int(0.15 * SR), np.float32); x = np.concatenate([g, y, g])
    return any(L.match_err(G.num_to_han(text), L.transcribe(r, x, SR)) == 0 for r in (r1, r2))

def work(r):
    t0 = time.time(); key = r['key']; text = key.split('|')[0]
    try:
        x = load(r['file']); an = C.analyze(x, SR, G.num_to_han(text))
        if an is not None:
            for a in STRENGTHS:
                y = C.synth(an, a)
                if heard_ok(text, y):
                    fn = hashlib.sha1(f'{key}#clear'.encode()).hexdigest()[:16] + '.mp3'
                    with open(os.path.join(G.CACHE, fn), 'wb') as f: f.write(G.mp3(y))
                    z = y[np.abs(y) > 0.01]
                    return {**r, 'src': r['file'], 'file': fn, 'ok': True, 'method': r['method'] + f'+clear{a}', 'clear': a,
                            'rms': float(np.sqrt(np.mean(z ** 2))) if len(z) else 0.0, 'secs': round(time.time() - t0, 2)}
        return {'key': key, 'src': r['file'], 'clear': 0, 'secs': round(time.time() - t0, 2)}
    except Exception as e:
        return {'key': key, 'src': r['file'], 'clear': 0, 'error': str(e)[:200]}

def final_records():
    rs = {}
    for line in open(G.RESULTS):
        try: x = json.loads(line)
        except Exception: continue
        if x.get('file'): rs[x['key']] = x
    tried = set()
    if os.path.exists(os.path.join(HERE, 'repairs.jsonl')):
        for line in open(os.path.join(HERE, 'repairs.jsonl')):
            try: x = json.loads(line)
            except Exception: continue
            tried.add(x['key'])
            if x.get('ok') and x.get('file') and x['key'] in rs: rs[x['key']] = x
    return [x for x in rs.values() if x['kind'] in ('word', 'sent') and (x['ok'] or x['key'] in tried)]

if __name__ == '__main__':
    args = sys.argv[1:]
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 4
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else None
    done = {}
    if os.path.exists(OUT):
        for line in open(OUT):
            try: x = json.loads(line); done[x['key']] = x['src']
            except Exception: pass
    lvl = lambda p: 0 if p == 'shared' else {'1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'a': 7}[p[1] if p[0] == 'h' else 'a']
    todo = [x for x in final_records() if done.get(x['key']) != x['file']]
    todo.sort(key=lambda x: (x['kind'] != 'word', lvl(x['pack'])))   # words first, early levels first
    if limit: todo = todo[:limit]
    print(f'{len(todo)} clips to clarify ({len(done)} already done)', flush=True)
    t0 = time.time(); n = c = 0
    with Pool(workers, initializer=init) as pool, open(OUT, 'a') as out:
        for x in pool.imap_unordered(work, todo, chunksize=2):
            out.write(json.dumps(x, ensure_ascii=False) + '\n'); out.flush()
            n += 1; c += x.get('clear', 0) > 0
            if n % 200 == 0 or n == len(todo):
                m = (time.time() - t0) / 60
                print(f'{n}/{len(todo)} done, {c} clearer ({100 * c // max(n, 1)}%), {m:.1f} min, ~{m / n * (len(todo) - n):.0f} min left', flush=True)
