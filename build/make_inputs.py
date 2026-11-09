# Build agent-facing inputs: per-level word lists (txt) and frequency partitions for HSK4-6 + advanced.
import json, re, os
V = 'vocab'
def short_gloss(en):
    first = en.split('; ')
    out = []
    for part in first:
        p = re.sub(r'\([^)]*\)', '', part).strip(' ,')
        p = re.sub(r'\s+', ' ', p)
        if not p:
            continue
        if len(p) > 38:
            p = p[:38].rsplit(' ', 1)[0] + '…'
        out.append(p)
        if len(out) >= 2 or len(', '.join(out)) > 28:
            break
    if not out:
        out = [re.sub(r'[()]', '', first[0]).strip()]
    return '; '.join(out)
os.makedirs('inputs', exist_ok=True)
plan = {'1': None, '2': None, '3': None, '4': 20, '5': 26, '6': 25, 'adv': 12}
for lvl, nunits in plan.items():
    words = json.load(open(f'{V}/vocab_hsk{lvl}.json' if lvl != 'adv' else f'{V}/vocab_adv.json'))
    if lvl == 'adv':
        # drop proper nouns / very rare, keep top 1200
        words = [w for w in words if 'nr' not in w['pos'] and 'ns' not in w['pos'] and 'nz' not in w['pos']][:1200]
    with open(f'inputs/hsk{lvl}_words.txt', 'w') as f:
        f.write('# zh\tpinyin\tauto-gloss\tfull dictionary meaning\n')
        for w in words:
            f.write(f"{w['zh']}\t{w['py']}\t{short_gloss(w['en'])}\t{w['en']}\n")
    if nunits:
        size = -(-len(words) // nunits)
        units = [[w['zh'] for w in words[i:i+size]] for i in range(0, len(words), size)]
        json.dump(units, open(f'inputs/hsk{lvl}_units.json', 'w'), ensure_ascii=False)
        print(lvl, len(words), 'words ->', len(units), 'units of', size)
    else:
        print(lvl, len(words), 'words (agent partitions)')
