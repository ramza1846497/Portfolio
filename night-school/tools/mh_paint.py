"""人体モデル（human.gltf.json）用の肌と服の絵を焼く。模様は 3D の位置で決めるので、UV の継ぎ目でもつながる。

usage: python3 -I mh_paint.py <makehuman/data dir> <out dir>

肌（体の元の UV、1024）：
  skin_living   生身の人（母親・店員）
  skin_ghost    花子さん：青白く冷たい肌、透ける静脈、あざ、すりむいた膝、黒ずんだ爪、片目から血の涙
  skin_creature 影の子ども：死人の灰青色、紫の死斑、ひび割れ、裂けた傷、目と口から広がる黒い血管、血の涙、泥
服（mh_common.py の UV、1024、透明＝穴）：
  cloth_rag     ぼろぼろの黒い服：虫食いの穴・裂け目・泥・乾いた血
  cloth_blouse  黄ばんだ白いブラウス：襟の汚れ・襟から垂れた血・汗じみ・小さな穴
  cloth_skirt   赤い吊りスカート：プリーツ・黒ずんだしみ・泥・ほつれた裾
  cloth_plain   ふつうの服（色は材質で付ける）：汚れ・しみ・すり切れ
出力：<名前>_d.webp（色。服は透明つき）、<名前>_n.webp（法線）、肌は <名前>_r.webp（粗さ）
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mh_common import cloth_uv_maker, face_uvs, load  # noqa: E402

DATA, OUT = sys.argv[1], sys.argv[2]
S = 1024
V, VT, groups, skel, jp = load(DATA)
bones = skel['bones']


def head(b):
    return jp[bones[b]['head']]


def tail(b):
    return jp[bones[b]['tail']]


def vertex_normals(faces):
    N = np.zeros_like(V)
    for f in faces:
        p = [V[i] for i, _ in f]
        for k in range(1, len(p) - 1):
            N[[f[0][0], f[k][0], f[k + 1][0]]] += np.cross(p[k] - p[0], p[k + 1] - p[0])
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


# ---------------------------------------------------------------- 三角形を UV 空間へ塗る
def rasterize(tris):
    """tris: [(p3[3,3], n3[3,3], uv3[3,2])]（uv は glTF の向き：上が 0）。
    塗った画素の 3D 位置・法線・接線（u が増える向き）・従接線（画像の上向き）を返す"""
    P = np.zeros((S, S, 3), np.float32)
    NN = np.zeros((S, S, 3), np.float32)
    T = np.zeros((S, S, 3), np.float32)
    B = np.zeros((S, S, 3), np.float32)
    filled = np.zeros((S, S), bool)
    for p3, n3, uv in tris:
        xy = uv * S - 0.5
        x0, y0 = np.floor(xy.min(axis=0)).astype(int)
        x1, y1 = np.ceil(xy.max(axis=0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, S - 1), min(y1, S - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        a, b, c = xy
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
        w1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        ys, xs = gy[inside], gx[inside]
        W = np.stack([w0[inside], w1[inside], w2[inside]], axis=1)
        P[ys, xs] = W @ p3
        nn = W @ n3
        NN[ys, xs] = nn / np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        duv1 = uv[1] - uv[0]
        duv2 = uv[2] - uv[0]
        e1 = p3[1] - p3[0]
        e2 = p3[2] - p3[0]
        r = duv1[0] * duv2[1] - duv2[0] * duv1[1]
        if abs(r) < 1e-14:
            continue
        t = (e1 * duv2[1] - e2 * duv1[1]) / r
        bb = -(e2 * duv1[0] - e1 * duv2[0]) / r  # 画像の上向き（uv の y が減る向き）
        T[ys, xs] = t / max(np.linalg.norm(t), 1e-12)
        B[ys, xs] = bb / max(np.linalg.norm(bb), 1e-12)
        filled[ys, xs] = True
    ys, xs = np.nonzero(filled)
    p = P[ys, xs].astype(np.float64)
    n = NN[ys, xs].astype(np.float64)
    tt = T[ys, xs].astype(np.float64)
    bb = B[ys, xs].astype(np.float64)
    tt -= n * (tt * n).sum(1, keepdims=True)
    tt /= np.maximum(np.linalg.norm(tt, axis=1, keepdims=True), 1e-9)
    bb -= n * (bb * n).sum(1, keepdims=True) + tt * (bb * tt).sum(1, keepdims=True)
    bb /= np.maximum(np.linalg.norm(bb, axis=1, keepdims=True), 1e-9)
    uvpx = np.stack([xs, ys], axis=1) / S
    return dict(ys=ys, xs=xs, p=p, n=n, t=tt, b=bb, uv=uvpx, filled=filled)


# ---------------------------------------------------------------- 3D の雑音
rng = np.random.default_rng(3)
PERM = np.concatenate([rng.permutation(256)] * 2)
GR = rng.normal(size=(256, 3))
GR /= np.linalg.norm(GR, axis=1, keepdims=True)


def perlin(q):
    i = np.floor(q).astype(np.int64)
    f = q - i
    u = f * f * f * (f * (f * 6 - 15) + 10)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = PERM[(PERM[(PERM[(i[:, 0] + dx) & 255] + i[:, 1] + dy) & 255] + i[:, 2] + dz) & 255]
                d = f - np.array([dx, dy, dz])
                wx = u[:, 0] if dx else 1 - u[:, 0]
                wy = u[:, 1] if dy else 1 - u[:, 1]
                wz = u[:, 2] if dz else 1 - u[:, 2]
                out = out + (GR[h] * d).sum(1) * wx * wy * wz
    return out


def fbm(q, octaves=4):
    s, a, tot = 0, 1, 0
    for o in range(octaves):
        s = s + perlin(q * (2 ** o) + o * 17.3) * a
        tot += a
        a *= 0.5
    return s / tot


def worley_edge(q):
    """細胞の境目までの近さ（ひび割れ用）。0 が境目"""
    i = np.floor(q).astype(np.int64)
    f1 = np.full(len(q), 9.0)
    f2 = np.full(len(q), 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                h = PERM[(PERM[(PERM[c[:, 0] & 255] + c[:, 1]) & 255] + c[:, 2]) & 255]
                off = (GR[h] * 0.45 + 0.5)
                d = np.linalg.norm(c + off - q, axis=1)
                f2 = np.where(d < f1, f1, np.minimum(f2, d))
                f1 = np.minimum(f1, d)
    return f2 - f1


def mix(col, c, w):
    w = np.clip(w, 0, 1)[:, None]
    return col * (1 - w) + np.array(c) / 255 * w


def save(name, rgb, filled, alpha=None, quality=88):
    img = np.zeros((S, S, 4 if alpha is not None else 3))
    if alpha is None:
        img[filled] = rgb
    else:
        img[filled, :3] = rgb
        img[filled, 3] = alpha
    # 島のまわりを広げる（縮小したときに、すき間の色がにじまないように）
    m = filled.copy()
    for _ in range(10):
        acc = np.zeros_like(img)
        cnt = np.zeros(m.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(m, (dy, dx), (0, 1))
            acc += np.roll(img, (dy, dx), (0, 1)) * sh[..., None]
            cnt += sh
        grow = (~m) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        m |= grow
    mode = 'RGBA' if alpha is not None else 'RGB'
    path = os.path.join(OUT, name + '.webp')
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), mode).save(path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(path)


def to_normal(r, height, k):
    p, n, t, b = r['p'], r['n'], r['t'], r['b']
    eps = 0.0007
    dT = (height(p + t * eps) - height(p - t * eps)) / (2 * eps)
    dB = (height(p + b * eps) - height(p - b * eps)) / (2 * eps)
    nt = np.stack([-k * dT, -k * dB, np.ones(len(p))], axis=1)
    nt /= np.linalg.norm(nt, axis=1, keepdims=True)
    return nt * 0.5 + 0.5


# ---------------------------------------------------------------- 肌
body = groups['body']
Nb = vertex_normals(body)
tris = []
for f in body:
    for k in range(1, len(f) - 1):
        tri = [f[0], f[k], f[k + 1]]
        tris.append((np.array([V[i] for i, _ in tri]), np.array([Nb[i] for i, _ in tri]), np.array([[VT[t][0], 1 - VT[t][1]] for _, t in tri])))
R = rasterize(tris)
p = R['p']
n = R['n']
print('skin texels', len(p))


def near(c, r):
    return np.clip(1 - np.linalg.norm(p - c, axis=1) / r, 0, 1) ** 2


def seg_near(a, b2, r, q=None):
    q = p if q is None else q
    ab = b2 - a
    t = np.clip(((q - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.clip(1 - np.linalg.norm(q - (a + t[:, None] * ab), axis=1) / r, 0, 1) ** 2


eyes = [head(f'eye.{s}') for s in 'LR']
oris = [jp[bones[b]['head']] for b in bones if b.startswith('oris')]
mouth = np.mean(oris, axis=0)
arms = sum(seg_near(head(f'upperarm01.{s}'), head(f'wrist.{s}'), 0.06) for s in 'LR')
hands = np.clip(sum(near(head(f'wrist.{s}'), 0.13) for s in 'LR'), 0, 1)
feet = np.clip(sum(seg_near(head(f'foot.{s}'), tail(f'foot.{s}'), 0.09) for s in 'LR'), 0, 1)
knees = np.clip(sum(near(head(f'lowerleg01.{s}') + np.array([0, 0, 0.04]), 0.06) for s in 'LR'), 0, 1)
neck = seg_near(head('neck01'), head('head'), 0.07)
chest = seg_near(head('spine03'), head('spine01'), 0.14)
face = np.clip(near(head('head') + np.array([0, 0.09, 0.08]), 0.12) * 2, 0, 1) * (n[:, 2] > 0.1)
tips = 0
for s in 'LR':
    for i in range(1, 6):
        tips = tips + seg_near(head(f'finger{i}-3.{s}'), tail(f'finger{i}-3.{s}'), 0.012)
tips = np.clip(tips, 0, 1)
toes = np.clip(sum(near(tail(f'foot.{s}'), 0.05) for s in 'LR'), 0, 1)
dm = (p - mouth) / np.array([0.026, 0.011, 0.03])
lips = np.clip(1 - np.linalg.norm(dm, axis=1), 0, 1) ** 0.6
socket = np.clip(sum(near(e + np.array([0, -0.006, 0.0]), 0.034) for e in eyes), 0, 1)
nails = 0
for s in 'LR':
    for i in range(1, 6):
        d3 = head(f'finger{i}-3.{s}')
        tp = tail(f'finger{i}-3.{s}')
        nails = nails + seg_near(d3 + (tp - d3) * 0.3, tp, 0.006)
nails = np.clip(nails, 0, 1)
blot = np.clip(fbm(p * 9) * 1.6 + 0.5, 0, 1)
fine = fbm(p * 260, 2)
ridge = 1 - np.abs(fbm(p * 14, 3) * 2)
vmask = np.clip(arms + hands + neck * 0.8 + chest * 0.5 + 0.25, 0, 1)


def tears(width=0.007, length=0.09, which=(0, 1)):
    """目の下から頬を伝って垂れた血の跡"""
    out = 0
    for k in which:
        e = eyes[k]
        below = e[1] - 0.008 - p[:, 1]
        wob = 0.004 * np.sin(p[:, 1] * 140 + k * 2) + 0.003 * fbm(p * 80, 2)
        dx = np.abs(p[:, 0] - (e[0] * 0.85 + wob))
        front = (p[:, 2] > e[2] - 0.04) & (n[:, 2] > 0.2)
        m = np.clip(1 - dx / width, 0, 1) * np.clip(below / 0.01, 0, 1) * np.clip(1 - below / length, 0, 1) * front
        out = out + m
    return np.clip(out, 0, 1)


def mouth_blood():
    below = mouth[1] - p[:, 1]
    dx = np.abs(p[:, 0] - mouth[0] - 0.006 * np.sin(p[:, 1] * 90))
    drip = np.clip(1 - dx / 0.012, 0, 1) * np.clip(below / 0.005, 0, 1) * np.clip(1 - below / 0.07, 0, 1) * (n[:, 2] > 0.2)
    smear = np.clip(1 - np.linalg.norm((p - mouth) / np.array([0.045, 0.02, 0.04]), axis=1), 0, 1)
    return np.clip(drip + smear * (fbm(p * 60, 2) > -0.1), 0, 1)


def wounds(spots):
    """裂けた傷：(中心, 向き, 長さ, 幅) の楕円"""
    w = 0
    for c, d, L, W in spots:
        d = np.array(d, float)
        d /= np.linalg.norm(d)
        q = p - c
        along = q @ d
        across = np.linalg.norm(q - along[:, None] * d, axis=1)
        jag = 1 + 0.4 * fbm(p * 120, 2)
        m = np.clip(1 - (along / (L / 2)) ** 2 - (across / (W * jag)) ** 2, 0, 1)
        w = w + m
    return np.clip(w, 0, 1)


def scratches(c, d, L, count=3, gap=0.012):
    d = np.array(d, float)
    d /= np.linalg.norm(d)
    side = np.cross(d, [0, 0, 1.0])
    side /= np.linalg.norm(side)
    out = 0
    for i in range(count):
        a = c + side * (i - (count - 1) / 2) * gap
        out = out + seg_near(a - d * L / 2, a + d * L / 2, 0.0025)
    return np.clip(out, 0, 1)


def front_of(b0, b1, t=0.5, off=0.035, side=np.array([0, 0, 1.0])):
    return head(b0) * (1 - t) + head(b1) * t + side * off


def skin(style):
    col = np.zeros((len(p), 3))
    rough = np.full(len(p), 0.55)
    if style == 'living':
        col[:] = np.array([226, 200, 184]) / 255
        col = mix(col, (212, 150, 140), 0.35 * blot)
        col *= (1 + 0.05 * fine)[:, None]
        vein = np.clip((ridge - 0.9) / 0.1, 0, 1) * vmask
        col = mix(col, (120, 135, 170), 0.25 * vein)
        col = mix(col, (130, 95, 100), 0.25 * socket)
        col = mix(col, (170, 105, 105), 0.45 * lips)
        col = mix(col, (225, 200, 195), 0.5 * nails)
        rough -= 0.1 * face + 0.15 * lips
        wet = 0
        crack = 0
        wound = 0
    elif style == 'ghost':
        # 水に浸かっていたような、青白く冷たい肌
        col[:] = np.array([200, 200, 196]) / 255
        col = mix(col, (170, 178, 200), 0.7 * blot)
        col = mix(col, (150, 160, 150), 0.35 * np.clip(fbm(p * 5 + 4) * 2 + 0.3, 0, 1))
        col *= (1 + 0.06 * fine)[:, None]
        fmask = np.clip(vmask + face * 0.8, 0, 1)
        vein = np.clip((ridge - 0.84) / 0.16, 0, 1) * fmask
        col = mix(col, (70, 90, 140), 0.6 * vein)
        col = mix(col, (45, 35, 55), 0.85 * socket)
        col = mix(col, (120, 115, 145), 0.6 * lips)
        # 口の端と鼻の下のくすみ、頬のこけた影
        col = mix(col, (120, 110, 120), 0.35 * np.clip(near(mouth, 0.05) * 1.5, 0, 1))
        col = mix(col, (60, 55, 70), 0.6 * nails)
        col = mix(col, (130, 125, 150), 0.4 * tips)
        # あざ（黄・緑・紫の輪）と、すりむいた膝
        bruise = np.clip(fbm(p * 22 + 3) * 3 - 0.6, 0, 1) * np.clip(arms * 2 + seg_near(head('lowerleg01.L'), head('foot.L'), 0.08) + seg_near(head('lowerleg01.R'), head('foot.R'), 0.08), 0, 1)
        col = mix(col, (110, 80, 120), 0.55 * bruise)
        col = mix(col, (150, 150, 90), 0.3 * np.clip(bruise * 2 - 0.4, 0, 1) * (1 - bruise))
        scab = knees * np.clip(fbm(p * 90, 2) + 0.3, 0, 1)
        col = mix(col, (110, 45, 35), 0.8 * scab)
        col = mix(col, (60, 55, 50), 0.35 * np.clip(knees + feet * 0.8 + hands * 0.3, 0, 1) * np.clip(fbm(p * 40) + 0.4, 0, 1))
        t1 = tears(0.005, 0.07, (0,))
        col = mix(col, (70, 10, 10), 0.85 * t1)
        wet = t1 * 0.6 + socket * 0.3
        crack = 0
        wound = 0
        rough = rough + 0.1 - 0.35 * wet + 0.25 * scab
    else:
        # 影の子ども：死人の灰青色。紫の死斑、ひび割れ、裂けた傷、黒い血管、血の涙、泥
        col[:] = np.array([150, 156, 160]) / 255
        col = mix(col, (128, 142, 128), 0.45 * np.clip(fbm(p * 6 + 9) * 2 + 0.5, 0, 1))
        livor = np.clip(fbm(p * 10 + 5) * 2.2 + 0.2, 0, 1) * np.clip(0.5 - n[:, 2] * 0.5 + (0.6 - p[:, 1]) * 0.6, 0, 1)
        col = mix(col, (95, 55, 80), 0.55 * livor)
        col *= (1 + 0.07 * fine)[:, None]
        # 黒い血管：目・口・胸・首から広がる
        spread = np.clip(sum(near(e, 0.09) for e in eyes) * 1.4 + near(mouth, 0.07) * 1.4 + chest * 0.9 + neck + arms * 0.6 + 0.15, 0, 1)
        vein = np.clip((ridge - 0.8) / 0.2, 0, 1) * spread
        vein2 = np.clip((1 - np.abs(fbm(p * 32 + 1, 3) * 2) - 0.86) / 0.14, 0, 1) * spread
        col = mix(col, (25, 20, 28), 0.75 * np.clip(vein + vein2 * 0.7, 0, 1))
        col = mix(col, (30, 22, 30), 0.85 * socket)
        col = mix(col, (40, 25, 35), 0.8 * lips)
        col = mix(col, (35, 28, 40), 0.75 * np.clip(tips + toes, 0, 1))
        col = mix(col, (20, 18, 18), 0.9 * nails)
        # ひび割れ：顔・腕・胸に、乾いた皮膚の裂け目
        cmask = np.clip(face * 0.8 + arms * 0.9 + chest + 0.25, 0, 1) * np.clip(fbm(p * 7 + 2) * 2 + 0.6, 0, 1)
        ce = worley_edge(p * 70)
        crack = np.clip(1 - ce / 0.07, 0, 1) * cmask
        col = mix(col, (40, 20, 20), 0.8 * crack)
        # 裂けた傷
        W = wounds([
            (front_of('lowerarm01.L', 'wrist.L', 0.5, 0.028, np.array([0.3, 0, 1.0])), (0.6, 1, 0.2), 0.09, 0.008),
            (front_of('lowerarm01.R', 'wrist.R', 0.35, 0.028, np.array([-0.3, 0, 1.0])), (-0.5, 1, 0), 0.06, 0.006),
            (front_of('upperleg01.R', 'lowerleg01.R', 0.55, 0.06), (0.4, 1, 0), 0.1, 0.01),
            (head('spine03') + np.array([0.09, 0.0, 0.06]), (0.2, 1, 0.1), 0.08, 0.007),
            (head('head') + np.array([0.055, 0.075, 0.075]), (0.3, 1, 0), 0.035, 0.004),
        ])
        rim = np.clip(W * 3, 0, 1) - W
        col = mix(col, (120, 60, 60), 0.6 * rim)
        col = mix(col, (45, 6, 8), 0.95 * np.clip(W * 2.5, 0, 1))
        sc = scratches(front_of('lowerarm01.R', 'wrist.R', 0.6, 0.03), (0.3, 1, 0), 0.07) + scratches(head('spine02') + np.array([-0.06, -0.03, 0.09]), (0.6, -1, 0), 0.09)
        col = mix(col, (90, 25, 25), 0.8 * np.clip(sc, 0, 1))
        t2 = tears(0.008, 0.11)
        mb = mouth_blood()
        col = mix(col, (55, 6, 6), 0.9 * np.clip(t2 + mb, 0, 1))
        # 泥：手・足・ひざ
        dirt = np.clip(hands * 0.9 + feet + knees, 0, 1) * np.clip(fbm(p * 30 + 7) * 1.5 + 0.6, 0, 1)
        col = mix(col, (45, 38, 30), 0.75 * dirt)
        wound = W
        wet = np.clip(W * 2 + t2 + mb * 0.7 + socket * 0.5, 0, 1)
        rough = 0.72 - 0.55 * wet + 0.15 * dirt + 0.1 * crack
    rough = np.clip(rough, 0.08, 1)

    def height(q):
        h = 0.18 * fbm(q * 900, 2)  # 毛穴
        h += 0.08 * fbm(q * 300, 2)
        if style != 'living':
            vr = (1 - np.abs(fbm(q * 14, 3) * 2))
            h += 0.3 * np.clip((vr - 0.86) / 0.14, 0, 1) * np.clip(vmask + (0.5 if style == 'creature' else 0), 0, 1)
        side = np.clip((np.abs(q[:, 0]) - 0.03) / 0.05, 0, 1)
        ch = seg_near(head('spine03'), head('spine01'), 0.14, q)
        ribs = 0.25 if style == 'living' else 0.6
        h += ribs * ch * side * (0.5 + 0.5 * np.sin(q[:, 1] * 2 * np.pi / 0.026))
        if style == 'creature':
            ce = worley_edge(q * 70)
            cm = np.clip(np.clip(face * 0.8 + arms * 0.9 + chest + 0.25, 0, 1), 0, 1)
            h -= 0.9 * np.clip(1 - ce / 0.07, 0, 1) * cm
            h -= 1.2 * wounds_h(q)
        return h

    def wounds_h(q):
        return 0  # 傷の凹みは色の粗さで表す（形は下で足す）

    nm = to_normal(R, height, 0.0011 if style == 'living' else 0.0016)
    if style == 'creature':
        # 傷口は深くえぐれ、縁が盛り上がる
        dz = -0.5 * wound + 0.3 * (np.clip(wound * 3, 0, 1) - wound)
        nm[:, 2] = np.clip(nm[:, 2] + dz * 0.1, 0, 1)
    sizes = save(f'skin_{style}_d', col, R['filled']) + save(f'skin_{style}_n', nm, R['filled'], quality=90)
    small = np.zeros((S, S, 3))
    small[R['filled']] = rough[:, None]
    img = Image.fromarray((np.clip(small, 0, 1) * 255).astype(np.uint8)).resize((512, 512))
    img.save(os.path.join(OUT, f'skin_{style}_r.webp'), 'WEBP', quality=80, method=6)
    print('skin', style, sizes)


for st in ('living', 'ghost', 'creature'):
    skin(st)

# ---------------------------------------------------------------- 服
rect_of, uvf = cloth_uv_maker(jp, bones)
Nc = vertex_normals(groups['helper-tights'] + groups['helper-skirt'])
ctris = []
# 服の面の部位は mh_build.py が書き出した物を使う（UV の区画が一致するように）
import json  # noqa: E402
TIGHTS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tights_prims.json')))
for prim, faces in (('tights', groups['helper-tights']), ('skirt', groups['helper-skirt'])):
    for fi, f in enumerate(faces):
        name = TIGHTS[fi] if prim == 'tights' else 'skirt'
        uvs = face_uvs(name, f, V, rect_of, uvf)
        for k in range(1, len(f) - 1):
            idx = [0, k, k + 1]
            ctris.append((np.array([V[f[j][0]] for j in idx]), np.array([Nc[f[j][0]] for j in idx]), np.array([uvs[j] for j in idx])))
C = rasterize(ctris)
p = C['p']
n = C['n']
uvc = C['uv']
print('cloth texels', len(p))
pel = head('root')
ang = np.arctan2(p[:, 0] - pel[0], p[:, 2] - pel[2])
skirt_mask = (uvc[:, 1] > 0.3) & (uvc[:, 1] < 0.55)
collar = seg_near(head('neck01') + np.array([-0.06, -0.02, 0.06]), head('neck01') + np.array([0.06, -0.02, 0.06]), 0.06) + near(head('neck01'), 0.09)
armpit = np.clip(sum(near(head(f'upperarm01.{s}') + np.array([-0.04 if s == 'L' else 0.04, -0.06, 0]), 0.07) for s in 'LR'), 0, 1)
low = np.clip((0.35 - p[:, 1]) / 0.3, 0, 1)
weave = np.sin(uvc[:, 0] * S * np.pi * 0.9) * np.sin(uvc[:, 1] * S * np.pi * 0.9)


def drips(origin_y, xs, length, width=0.008):
    out = 0
    for x0 in xs:
        wob = 0.004 * np.sin(p[:, 1] * 120 + x0 * 50)
        dx = np.abs(p[:, 0] - x0 - wob)
        below = origin_y - p[:, 1]
        L = length * (0.6 + 0.4 * np.sin(x0 * 91) ** 2)
        out = out + np.clip(1 - dx / width, 0, 1) * np.clip(below / 0.01, 0, 1) * np.clip(1 - below / L, 0, 1) * (n[:, 2] > 0.1)
    return np.clip(out, 0, 1)


def splatter(c, r, density=0.25):
    d = np.clip(1 - np.linalg.norm(p - c, axis=1) / r, 0, 1)
    spots = (fbm(p * 140 + 11, 2) > 0.35 - d * 0.6) * d
    return np.clip(spots + (d ** 2) * density, 0, 1)


def cloth(style):
    rough = None
    alpha = np.ones(len(p))
    if style == 'rag':
        col = np.tile(np.array([26, 24, 28]) / 255, (len(p), 1))
        col = mix(col, (70, 66, 64), 0.5 * np.clip(fbm(p * 8) * 2 + 0.2, 0, 1))
        col = mix(col, (60, 48, 36), 0.85 * low * np.clip(fbm(p * 25) + 0.6, 0, 1))
        blood = splatter(head('spine02') + np.array([0.05, 0.0, 0.1]), 0.12, 0.4) + drips(head('spine02')[1] + 0.02, [0.02, 0.06, 0.09], 0.35)
        col = mix(col, (50, 8, 8), 0.8 * np.clip(blood, 0, 1))
        # 虫食いの穴と、大きな裂け目
        holes = fbm(p * 22 + 4) + 0.35 * fbm(p * 70, 2)
        tear = np.abs(fbm(p * [6, 2, 6] + 8)) < 0.022
        alpha = (holes < 0.44).astype(float)
        edge = np.clip(1 - np.abs(holes - 0.44) / 0.06, 0, 1)
        col = mix(col, (10, 9, 10), 0.6 * edge)
    elif style == 'blouse':
        col = np.tile(np.array([232, 228, 214]) / 255, (len(p), 1))
        col = mix(col, (205, 190, 140), 0.45 * np.clip(fbm(p * 7 + 2) * 2 + 0.3, 0, 1))
        col = mix(col, (150, 135, 110), 0.5 * np.clip(collar, 0, 1) + 0.4 * armpit)
        col = mix(col, (150, 140, 120), 0.5 * low)
        blood = drips(head('neck01')[1] - 0.04, [-0.03, 0.01, 0.04], 0.25, 0.007) + splatter(head('neck01') + np.array([0.02, -0.06, 0.08]), 0.05, 0.6)
        col = mix(col, (95, 20, 15), 0.85 * np.clip(blood, 0, 1))
        ring = np.clip(1 - np.abs(np.abs(fbm(p * 9 + 6)) - 0.12) / 0.015, 0, 1)
        col = mix(col, (170, 150, 110), 0.35 * ring)
        holes = fbm(p * 30 + 9) + 0.3 * fbm(p * 90, 2)
        alpha = (holes < 0.5).astype(float)
    elif style == 'skirt':
        col = np.tile(np.array([128, 16, 18]) / 255, (len(p), 1))
        pleat = np.sin(ang * 24)
        col *= (1 + 0.14 * pleat * skirt_mask)[:, None]
        col = mix(col, (60, 8, 10), 0.6 * np.clip(fbm(p * 9 + 3) * 2.2 - 0.2, 0, 1))
        col = mix(col, (60, 50, 40), 0.7 * low * np.clip(fbm(p * 25) + 0.5, 0, 1))
        # 裾のほつれ
        hem_y = 0.12 + 0.02 * fbm(p * 60, 2)
        fray = p[:, 1] < hem_y + 0.03
        alpha = np.where(fray & (fbm(p * 140, 2) > 0.05), 0.0, 1.0) * skirt_mask + (~skirt_mask)
        holes = fbm(p * 26 + 13) + 0.3 * fbm(p * 80, 2)
        alpha = alpha * (holes < 0.47)
    else:
        col = np.tile(np.array([205, 205, 205]) / 255, (len(p), 1))
        col = mix(col, (150, 145, 135), 0.4 * np.clip(fbm(p * 8 + 4) * 2 + 0.2, 0, 1))
        col = mix(col, (110, 100, 90), 0.5 * low * np.clip(fbm(p * 20) + 0.5, 0, 1) + 0.3 * collar)
        stain = np.clip(fbm(p * 12 + 1) * 3 - 0.9, 0, 1)
        col = mix(col, (90, 60, 50), 0.5 * stain)
        holes = fbm(p * 30 + 21) + 0.3 * fbm(p * 90, 2)
        alpha = (holes < 0.55).astype(float)
    col *= (1 + 0.05 * weave)[:, None]

    def height(q):
        h = 0.5 * fbm(q * np.array([30, 5, 30]) + 2, 3)  # 垂れたしわ
        h += 0.3 * fbm(q * 120, 2)
        if style == 'skirt':
            a = np.arctan2(q[:, 0] - pel[0], q[:, 2] - pel[2])
            h += 0.6 * np.sin(a * 24) * skirt_mask
        return h

    nm = to_normal(C, height, 0.0009)
    # 織り目
    nm[:, 0] = np.clip(nm[:, 0] + 0.04 * np.sin(uvc[:, 0] * S * np.pi * 0.9), 0, 1)
    nm[:, 1] = np.clip(nm[:, 1] + 0.04 * np.sin(uvc[:, 1] * S * np.pi * 0.9), 0, 1)
    sizes = save(f'cloth_{style}_d', col, C['filled'], alpha=alpha) + save(f'cloth_{style}_n', nm, C['filled'], quality=88)
    print('cloth', style, sizes)


for st in ('rag', 'blouse', 'skirt', 'plain'):
    cloth(st)
