# Synthesize voice-like WAV files (harmonics + vibrato + breath noise) following Mandarin tone contours, for fake-microphone tests.
import math, random, struct, wave, sys
SR = 48000
def contour(t, x):
    return {1: 230 + 3*math.sin(x*7), 2: 165 + 95*x**1.3, 3: (175 - 55*(x/0.55)) if x < 0.55 else (120 + 60*((x-0.55)/0.45)), 4: 285 - 150*x, 0: 200}[t]
def synth(tone, path, dur=0.55, lead=0.8, tail=1.4, loud=1.0):
    n_lead, n_tone, n_tail = int(lead*SR), int(dur*SR), int(tail*SR)
    out = [random.gauss(0, 0.0015) for _ in range(n_lead)]
    ph = 0.0
    for i in range(n_tone):
        x = i / n_tone; f0 = contour(tone, x) * (1 + 0.004*math.sin(2*math.pi*5.5*i/SR))
        ph += 2*math.pi*f0/SR
        env = min(1, i/(0.04*SR)) * min(1, (n_tone-i)/(0.06*SR))
        s = sum((0.6/k) * math.sin(k*ph) for k in range(1, 9)) * 0.45 * env * loud
        out.append(s + random.gauss(0, 0.004))
    out += [random.gauss(0, 0.0015) for _ in range(n_tail)]
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v*32767)))) for v in out))
for t in (1, 2, 3, 4): synth(t, f'audio/tone{t}.wav')
synth(0, 'audio/voice.wav', dur=1.2, lead=0.3, tail=0.3)
print('ok')
