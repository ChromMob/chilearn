# Extract HSK 2.0 levels (o1..o6) + advanced (n7 not in old) into compact vocab files.
import json, sys, re
src, outdir = sys.argv[1], sys.argv[2]
d = json.load(open(src))
levels = {f'o{i}': [] for i in range(1, 7)}
adv = []
def clean_meanings(ms):
    out = []
    for m in ms:
        m = re.sub(r'\s+', ' ', m).strip()
        if m.startswith('variant of') or m.startswith('old variant') or m.startswith('surname '):
            continue
        out.append(m)
    return out or ms
for e in d:
    lv = e['l']
    f = e['f'][0]
    entry = {
        'zh': e['s'],
        'py': f['i']['y'],
        'num': f['i']['n'],
        'en': '; '.join(clean_meanings(f['m'])[:3]),
        'pos': e.get('p', []),
        'freq': e.get('q', 999999),
        'cl': f.get('c', []),
    }
    olds = [l for l in lv if l.startswith('o')]
    if olds:
        levels[min(olds)].append(entry)
    elif 'n7' in lv:
        adv.append(entry)
for k, v in levels.items():
    v.sort(key=lambda x: x['freq'])
    json.dump(v, open(f'{outdir}/vocab_hsk{k[1]}.json', 'w'), ensure_ascii=False, indent=0)
    print(k, len(v))
adv.sort(key=lambda x: x['freq'])
json.dump(adv, open(f'{outdir}/vocab_adv.json', 'w'), ensure_ascii=False, indent=0)
print('adv', len(adv))
