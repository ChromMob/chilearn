"""Per-syllable pronunciation verdicts for an expected text: ok / tone / no (Python reference of the app's checker)."""
import json, os, re
from pypinyin import lazy_pinyin, Style
from ctc import ctc_forward
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../app/public/data')
charpy = json.load(open(f'{DATA}/charpy.json')); level = json.load(open(f'{DATA}/core.json'))['charLevel']
LV = {'1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 'adv': 7}
# toned syllable -> common characters that have only that reading
TABLE = {}
for ch, rd in charpy.items():
    r = rd.split()
    if len(r) == 1 and ch in level: TABLE.setdefault(r[0], []).append(ch)
for k in TABLE: TABLE[k].sort(key=lambda c: LV.get(level[c], 9))
INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']
IG = [{'b', 'p'}, {'d', 't'}, {'g', 'k'}, {'z', 'zh', 'j'}, {'c', 'ch', 'q'}, {'s', 'sh', 'x'}, {'l', 'n', 'r'}, {'f', 'h'}, {'z', 'c', 's'}, {'zh', 'ch', 'sh'}, {'j', 'q', 'x'}]
FG = [{'an', 'ang'}, {'en', 'eng'}, {'in', 'ing'}, {'ian', 'iang'}, {'uan', 'uang'}, {'un', 'ong'}, {'u', 'v'}, {'ue', 've'}, {'e', 'o', 'ou'}, {'ai', 'ei'}, {'ao', 'ou'}, {'ie', 'ei'}, {'iu', 'iou', 'you'}]
def split(base):
    for i in INITIALS:
        if base.startswith(i): return i, base[len(i):]
    return '', base
def confusable(base):
    ini, fin = split(base); out = set()
    for g in IG:
        if ini in g: out |= {x + fin for x in g}
    for g in FG:
        if fin in g: out |= {ini + x for x in g}
    out.discard(base); return out
def readings(text):
    return [s.replace('5', '0') if s[-1:].isdigit() else s for s in lazy_pinyin(text, style=Style.TONE3, neutral_tone_with_five=True)]
def alternatives(syl):
    base, tone = syl[:-1], syl[-1]
    tones = [base + t for t in '12340' if t != tone and base + t in TABLE]
    conf = [b + t for b in sorted(confusable(base)) for t in '12340' if b + t in TABLE]
    return tones, conf
def verdicts(m, lp, text, margin=1.0, per=2):
    han = [c for c in text if re.match(r'[㐀-鿿]', c)]
    syl = readings(''.join(han)); base = ctc_forward(lp, m.encode(''.join(han))); out = []
    for i, (c, s) in enumerate(zip(han, syl)):
        tones, conf = alternatives(s); best = (-1e30, None, None)
        for kind, alts in (('tone', tones), ('no', conf)):
            for a in alts:
                for ch in TABLE[a][:per]:
                    if ch == c: continue
                    sc = ctc_forward(lp, m.encode(''.join(han[:i] + [ch] + han[i + 1:])))
                    if sc > best[0]: best = (sc, kind, a)
        dele = ctc_forward(lp, m.encode(''.join(han[:i] + han[i + 1:]))) if len(han) > 1 else -1e30
        if dele > best[0]: best = (dele, 'no', '-')
        gap = base - best[0]
        out.append((c, s, 'ok' if gap > -margin else best[1], round(gap, 2), best[2]))
    return out
