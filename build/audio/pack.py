"""Pack verified clips into one MP3 sprite per unit (+ a shared pack) and write per-level indexes for the app.
Output: app/public/audio/<pack>.mp3 and app/public/audio/index-<level>.json  ({files: [...], clips: {text: [fileIdx, start, length, verified]}})"""
import json, os, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '../../app/public/audio'); os.makedirs(OUT, exist_ok=True)
rs = {}
for line in open(os.path.join(HERE, 'results.jsonl')):
    try: r = json.loads(line)
    except Exception: continue
    if r.get('file'): rs[r['key']] = r
# second-pass repairs (repair.py): a passing repair replaces the original take
if os.path.exists(os.path.join(HERE, 'repairs.jsonl')):
    for line in open(os.path.join(HERE, 'repairs.jsonl')):
        try: r = json.loads(line)
        except Exception: continue
        if r.get('ok') and r.get('file') and r['key'] in rs: rs[r['key']] = r
# clearer tones (clarify_all.py): used when made from the current take and still recognised exactly
if os.path.exists(os.path.join(HERE, 'clarified.jsonl')):
    for line in open(os.path.join(HERE, 'clarified.jsonl')):
        try: r = json.loads(line)
        except Exception: continue
        if r.get('clear', 0) > 0 and r['key'] in rs and rs[r['key']]['file'] == r.get('src'): rs[r['key']] = r
def level_of(pack):
    if pack == 'shared': return 'shared'
    if pack.startswith('adv'): return 'adv'
    return pack[1]
# loudness: measure each clip once (cached) and store a playback volume so every clip sounds equally loud
RMS_CACHE = os.path.join(HERE, 'rms.json')
rms = json.load(open(RMS_CACHE)) if os.path.exists(RMS_CACHE) else {}
for r in rs.values():
    if r.get('rms') is not None and r['file'] not in rms: rms[r['file']] = r['rms']
def clip_rms(fn):
    if fn not in rms:
        pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(HERE, 'cache', fn), '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:'], capture_output=True).stdout
        x = np.frombuffer(pcm, dtype=np.float32); x = x[np.abs(x) > 0.01]
        rms[fn] = float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0
    return rms[fn]
for r in rs.values(): r['rms'] = clip_rms(r['file'])
json.dump(rms, open(RMS_CACHE, 'w'))
ref = float(np.median([r['rms'] for r in rs.values() if r['kind'] != 'syl' and r['rms'] > 0] or [0.08]))
def volume(r): return round(min(1.0, ref / r['rms']), 2) if r['rms'] > 0 else 1.0
packs = {}
for r in rs.values(): packs.setdefault(r['pack'], []).append(r)
indexes = {}; total = 0
for pack, clips in sorted(packs.items()):
    clips.sort(key=lambda r: r['key'])
    buf = bytearray(); entries = {}
    for r in clips:
        data = open(os.path.join(HERE, 'cache', r['file']), 'rb').read()
        entries[r['key']] = [len(buf), len(data), 1 if r['ok'] else 0, volume(r)]
        buf += data
    open(os.path.join(OUT, f'{pack}.mp3'), 'wb').write(bytes(buf)); total += len(buf)
    idx = indexes.setdefault(level_of(pack), {'files': [], 'clips': {}})
    fi = len(idx['files']); idx['files'].append(f'{pack}.mp3')
    for k, (start, ln, ok, vol) in entries.items(): idx['clips'][k] = [fi, start, ln, ok] + ([vol] if vol < 0.98 else [])
for lv, idx in indexes.items():
    json.dump(idx, open(os.path.join(OUT, f'index-{lv}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
ok = sum(1 for r in rs.values() if r['ok'])
print(f'{len(rs)} clips ({ok} verified) in {len(packs)} packs, {total/1e6:.1f} MB audio; indexes: {sorted(indexes)}')
