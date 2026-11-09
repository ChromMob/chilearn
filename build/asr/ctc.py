"""Reference implementation (Python) of the in-browser speech checker: Kaldi fbank -> zipformer CTC -> greedy transcript
and forced scoring of the expected text against same-syllable/other-tone and confusable-syllable alternatives."""
import os, re, numpy as np, onnxruntime as ort, kaldi_native_fbank as knf, sentencepiece as spm
MODEL = os.environ.get('ASR_MODEL', '/tmp/claude-0/-home-user/463c37e1-10cd-5a37-8302-42586a02b14f/scratchpad/tts/models/zipformer-ctc-small-zh')
PRINTABLE = list(range(256, 288)) + list(range(32, 127)) + list(range(288, 306)) + list(range(308, 319)) + list(range(321, 329)) + list(range(330, 383)) + list(range(384, 423))
B2C = {b: chr(PRINTABLE[b]) for b in range(256)}; C2B = {c: b for b, c in B2C.items()}
def byte_encode(s): return ''.join(B2C[b] for b in s.encode('utf-8'))
def byte_decode(s): return bytes(C2B[c] for c in s if c in C2B).decode('utf-8', errors='ignore')

class CTC:
    def __init__(self, d=MODEL, scale=1.0):
        so = ort.SessionOptions(); so.intra_op_num_threads = 1; so.log_severity_level = 3
        self.s = ort.InferenceSession(f'{d}/model.int8.onnx', so, providers=['CPUExecutionProvider'])
        self.sp = spm.SentencePieceProcessor(model_file=f'{d}/bbpe.model')
        self.tok = [l.rsplit(' ', 1)[0] for l in open(f'{d}/tokens.txt', encoding='utf-8').read().splitlines()]
        self.scale = scale
    def fbank(self, x, sr=16000):
        o = knf.FbankOptions(); o.frame_opts.dither = 0; o.frame_opts.snip_edges = False; o.frame_opts.samp_freq = sr
        o.mel_opts.num_bins = 80; o.mel_opts.low_freq = 20; o.mel_opts.high_freq = -400
        f = knf.OnlineFbank(o); f.accept_waveform(sr, (x * self.scale).tolist()); f.input_finished()
        return np.stack([f.get_frame(i) for i in range(f.num_frames_ready)]).astype(np.float32)
    def logprobs(self, x, sr=16000):
        F = self.fbank(x, sr)
        lp, n = self.s.run(None, {'x': F[None], 'x_lens': np.array([len(F)], dtype=np.int64)})
        return lp[0][:n[0]]
    def greedy(self, lp):
        ids = lp.argmax(1); out = []; prev = -1
        for i in ids:
            if i != prev and i != 0: out.append(int(i))
            prev = i
        return byte_decode(''.join(self.tok[i] for i in out).replace('▁', ''))
    def encode(self, text):
        # the model was trained on text with a space between CJK characters (icefall tokenize_by_CJK_char)
        return self.sp.encode(byte_encode(' '.join(re.findall(r'[㐀-鿿]|[^㐀-鿿\s]+', text))), out_type=int)

def ctc_forward(lp, ys):
    """log P(ys | audio) under CTC (sum over alignments)."""
    L = 2 * len(ys) + 1; ext = [0] * L
    for i, y in enumerate(ys): ext[2 * i + 1] = y
    T = lp.shape[0]; NEG = -1e30
    a = np.full(L, NEG); a[0] = lp[0, 0]
    if L > 1: a[1] = lp[0, ext[1]]
    for t in range(1, T):
        b = np.full(L, NEG)
        for s in range(L):
            v = a[s]
            if s >= 1: v = np.logaddexp(v, a[s - 1])
            if s >= 2 and ext[s] != 0 and ext[s] != ext[s - 2]: v = np.logaddexp(v, a[s - 2])
            b[s] = v + lp[t, ext[s]]
        a = b
    return float(np.logaddexp(a[L - 1], a[L - 2]) if L > 1 else a[0])

def ctc_align(lp, ys):
    """Viterbi CTC alignment: output frame index where each label of ys is first emitted."""
    L = 2 * len(ys) + 1; ext = [0] * L
    for i, y in enumerate(ys): ext[2 * i + 1] = y
    T = lp.shape[0]; NEG = -1e30
    a = np.full(L, NEG); a[0] = lp[0, 0]; a[1] = lp[0, ext[1]]
    bp = np.zeros((T, L), dtype=np.int32)
    for t in range(1, T):
        b = np.full(L, NEG)
        for s in range(L):
            cands = [(a[s], s)]
            if s >= 1: cands.append((a[s - 1], s - 1))
            if s >= 2 and ext[s] != 0 and ext[s] != ext[s - 2]: cands.append((a[s - 2], s - 2))
            v, k = max(cands); b[s] = v + lp[t, ext[s]]; bp[t, s] = k
        a = b
    s = L - 1 if a[L - 1] >= a[L - 2] else L - 2; path = [0] * T
    for t in range(T - 1, -1, -1): path[t] = s; s = bp[t, s]
    first = [None] * len(ys)
    for t, s in enumerate(path):
        if s % 2 == 1 and first[s // 2] is None: first[s // 2] = t
    return first
