"""Export the on-device speech checker's assets into the app.

app/public/asr/
  model.<i>.bin   the zipformer CTC model (int8 ONNX) split into parts under 15 MB (static-host and artifact file limits)
  lex.json        {v, parts, bytes, tokens: [byte-level token strings], chars: {char: [token ids]}, alts: {syl: [chars]}}
app/tests/fixtures/asr/  Python reference outputs (fbank, log-probs, CTC scores, transcripts) for the TypeScript parity tests
Usage: python3 export.py [--fixtures path/to/cases.pkl]"""
import json, os, sys, hashlib
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from ctc import CTC, MODEL, ctc_forward
APP = os.path.join(HERE, '../../app')
OUT = os.path.join(APP, 'public/asr'); os.makedirs(OUT, exist_ok=True)
DATA = os.path.join(APP, 'public/data')
PART = 14_000_000

charpy = json.load(open(f'{DATA}/charpy.json')); level = json.load(open(f'{DATA}/core.json'))['charLevel']
LV = {'1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'adv': 7}
m = CTC()

# 1. model parts
blob = open(f'{MODEL}/model.int8.onnx', 'rb').read()
for f in os.listdir(OUT):
    if f.startswith('model.') and f.endswith('.bin'): os.remove(os.path.join(OUT, f))
parts = []
for i in range(0, len(blob), PART):
    name = f'model.{len(parts)}.bin'; open(os.path.join(OUT, name), 'wb').write(blob[i:i + PART]); parts.append(name)

# 2. alternatives: toned syllable -> the two most common course characters with only that reading
alts = {}
for ch, rd in charpy.items():
    r = rd.split()
    if len(r) == 1 and ch in level: alts.setdefault(r[0], []).append(ch)
for k in alts: alts[k] = sorted(alts[k], key=lambda c: LV.get(level[c], 9))[:2]

# 3. token ids for every course character and every alternative character (each CJK character is its own word)
need = set(level) | {c for v in alts.values() for c in v}
chars = {c: m.encode(c) for c in sorted(need)}
lex = {'v': hashlib.sha1(blob).hexdigest()[:12], 'parts': parts, 'bytes': len(blob), 'tokens': m.tok, 'chars': chars, 'alts': alts}
json.dump(lex, open(os.path.join(OUT, 'lex.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'model {len(blob) / 1e6:.1f} MB in {len(parts)} parts; {len(chars)} characters; {len(alts)} syllables;',
      f'lex.json {os.path.getsize(os.path.join(OUT, "lex.json")) / 1e3:.0f} kB')

# 4. fixtures for the TypeScript parity tests
if '--fixtures' in sys.argv:
    import pickle
    FX = os.path.join(APP, 'tests/fixtures/asr'); os.makedirs(FX, exist_ok=True)
    cases = pickle.load(open(sys.argv[sys.argv.index('--fixtures') + 1], 'rb'))
    pick = [next(c for c in cases if c['label'] == k) for k in ('ok', 'tone', 'no')]
    meta = []
    for k, c in enumerate(pick):
        x = c['x'].astype(np.float32); F = m.fbank(x); lp = m.logprobs(x)
        x.tofile(f'{FX}/{k}.pcm.bin'); F.astype(np.float32).tofile(f'{FX}/{k}.fbank.bin'); lp.astype(np.float32).tofile(f'{FX}/{k}.lp.bin')
        seqs = {t: m.encode(t) for t in {c['target'], c['said'], c['target'][:1]}}
        meta.append({'target': c['target'], 'said': c['said'], 'label': c['label'], 'pos': c['pos'], 'samples': len(x),
                     'frames': F.shape[0], 'T': lp.shape[0], 'greedy': m.greedy(lp),
                     'scores': {t: [ids, ctc_forward(lp, ids)] for t, ids in seqs.items()}})
    json.dump(meta, open(f'{FX}/cases.json', 'w'), ensure_ascii=False, indent=1)
    print('fixtures:', [(x['target'], x['said'], x['label']) for x in meta])
