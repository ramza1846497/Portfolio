"""影の子どもの声を作る。Open JTalk の女性の声「mei」（CC BY 3.0, 名古屋工業大学）で言葉を読ませ、
ささやき声・喉を鳴らす声（ボーカルフライ）・息を呑む声などに加工して、public/audio/ に MP3 で書き出す。

usage: <pyopenjtalk のある python> voice_bake.py <out dir>
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
import pyopenjtalk
from scipy import signal

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
SR = 48000
rng = np.random.default_rng(13)


def tts(text, half_tone=0.0, speed=1.0):
    x, sr = pyopenjtalk.tts(text, half_tone=half_tone, speed=speed)
    x = x.astype(np.float64) / 32768.0
    assert sr == SR
    return trim(x)


def trim(x, th=0.01):
    idx = np.nonzero(np.abs(x) > th * np.abs(x).max())[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.01 * SR))
    b = min(len(x), idx[-1] + int(0.03 * SR))
    return x[a:b]


def whisper(x, smooth_hz=260):
    """声帯の振動（音の高さ）を消して、息だけの声にする：スペクトルの包絡を残し、位相をばらばらに"""
    f, t, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
    mag = np.abs(Z)
    k = max(1, int(smooth_hz / (f[1] - f[0])))
    ker = np.ones(k) / k
    env = np.apply_along_axis(lambda c: np.convolve(c, ker, mode='same'), 0, mag)
    # 息の声は高い方が強い
    tilt = np.clip((f / 2500.0), 0.35, 1.6)[:, None]
    ph = np.exp(2j * np.pi * rng.random(Z.shape))
    _, y = signal.istft(env * tilt * ph, SR, nperseg=1024, noverlap=768)
    return y[: len(x)]


def fry(x, base=34.0, jitter=0.35, sharp=0.007, floor=0.18):
    """喉を鳴らす声（ボーカルフライ）：声を、不規則な喉の閉じ開きの拍で刻む。
    拍と拍の間も声は少し残す（間が無音だと、声ではなく「カチカチ」という音に聞こえる）"""
    n = len(x)
    env = np.zeros(n)
    t = 0.0
    while t < n / SR:
        f = base * (1 + (rng.random() - 0.5) * 2 * jitter)
        i = int(t * SR)
        L = int(sharp * 6 * SR)
        k = np.arange(min(L, n - i))
        amp = 0.6 + 0.4 * rng.random()
        env[i:i + len(k)] += amp * np.exp(-k / (sharp * SR))
        t += 1.0 / f
    env = floor + (1 - floor) * np.clip(env, 0, 1.5)
    return x * env * 1.4


def fade(x, a=0.01, b=0.08):
    n = len(x)
    w = np.ones(n)
    na, nb = int(a * SR), int(b * SR)
    w[:na] = np.linspace(0, 1, na)
    w[n - nb:] = np.linspace(1, 0, nb)
    return x * w


def stretch(x, rate):
    """音の高さを変えずに長さを変える（STFT の位相を合わせて、ゆっくりにする）"""
    f, t, Z = signal.stft(x, SR, nperseg=2048, noverlap=1536)
    hop = 512
    steps = np.arange(0, Z.shape[1] - 1, rate)
    phase = np.angle(Z[:, 0])
    omega = 2 * np.pi * hop * np.arange(Z.shape[0]) / 2048
    out = np.zeros((Z.shape[0], len(steps)), complex)
    for i, s in enumerate(steps):
        j = int(s)
        frac = s - j
        a, b = Z[:, j], Z[:, j + 1]
        mag = (1 - frac) * np.abs(a) + frac * np.abs(b)
        out[:, i] = mag * np.exp(1j * phase)
        dp = np.angle(b) - np.angle(a) - omega
        dp -= 2 * np.pi * np.round(dp / (2 * np.pi))
        phase += omega + dp
    _, y = signal.istft(out, SR, nperseg=2048, noverlap=1536)
    return y


def lowpass(x, hz):
    b, a = signal.butter(2, hz / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def highpass(x, hz):
    b, a = signal.butter(2, hz / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def norm(x, peak=0.85):
    return x / (np.abs(x).max() + 1e-9) * peak


def save(name, x):
    x = norm(fade(x))
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    import wave
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    path = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-ar', '44100', '-ac', '1', '-b:a', '64k', path], check=True)
    os.unlink(tmp)
    print(name, f'{len(x) / SR:.2f}s', os.path.getsize(path), 'bytes')


def mix(*parts):
    n = max(len(p) for p, _ in parts)
    y = np.zeros(n)
    for p, g in parts:
        y[: len(p)] += p * g
    return y


# ---------------------------------------------------------------- 振りかぶる：喉の奥で鳴る「あ゛あ゛あ゛……」（だんだん強く）
a = tts('あー', half_tone=-3, speed=0.6)
a = stretch(a, 0.55)[: int(0.85 * SR)]
cro = fry(a, base=42, jitter=0.4)
ramp = np.linspace(0.35, 1.0, len(cro)) ** 1.5
breath = whisper(a) * 0.5
save('croak', mix((cro * ramp, 1.0), (breath * ramp, 0.35)))

# 長い喉鳴り（近くで待っているとき、ときどき）
a = tts('あー', half_tone=-4, speed=0.5)
a = stretch(a, 0.4)[: int(1.6 * SR)]
cro = fry(a, base=34, jitter=0.45)
save('croak_long', mix((cro, 1.0), (whisper(a), 0.2)))

# ---------------------------------------------------------------- 振り下ろす：息を吐き出す、短い叫び「ァッ！」
a = tts('あっ', half_tone=6, speed=1.2)
# 叫んだあと、息が抜けていく「はぁ……」
h = whisper(tts('はぁー', half_tone=5, speed=0.9))
sh = np.concatenate([mix((a, 0.6), (whisper(a), 0.9)), np.zeros(0)])
sh = np.tanh(sh * 3.5) / 3.5
sh = mix((sh, 1.0), (np.concatenate([np.zeros(int(0.08 * SR)), h]) * 0.5, 1.0))
save('strike', highpass(sh, 250))

# ---------------------------------------------------------------- 打たれる：息を呑むような「ひっ」
a = tts('ひっ', half_tone=7, speed=1.3)
save('whimper', mix((a, 0.45), (whisper(a), 1.0)))

# ---------------------------------------------------------------- 消える：ゆっくり沈んでいく、かすれた「あぁぁぁ……」
a = tts('あぁー', half_tone=2, speed=0.6)
a = stretch(a, 0.45)
n = len(a)
# 音の高さをゆっくり下げる（再生の速さを少しずつ落とす）
idx = np.cumsum(np.linspace(1.0, 0.7, n))
idx = idx[idx < n - 1]
low = np.interp(idx, np.arange(n), a)
save('death', mix((whisper(low), 1.0), (fry(low, base=40) * np.linspace(0.2, 1, len(low)), 0.6)))

# ---------------------------------------------------------------- 近づきながら、ささやく子どもの声
for i, line in enumerate(['あそぼ', 'ねえ', 'いっしょに', 'みつけた', 'どこいくの', 'こっちきて']):
    a = tts(line, half_tone=4, speed=0.8)
    w = whisper(a)
    # ほんの少しだけ声の芯を残す（言葉が聞き取れるように）
    save(f'whisper{i}', mix((w, 1.0), (lowpass(a, 1800), 0.08)))

# くすくす笑い（逆再生を混ぜて、どこか変に）
a = tts('ふふふ', half_tone=6, speed=1.2)
w = whisper(a)
save('giggle', mix((w, 1.0), (w[::-1] * np.linspace(0, 0.5, len(w)), 1.0)))
