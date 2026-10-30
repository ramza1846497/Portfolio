"""MakeHuman の体の UV 配置に合わせた肌の絵（色・法線）を焼く。
3D の位置で模様を決めるので、UV の継ぎ目でも模様がつながる。

usage: python3 -I mh_skin.py <makehuman/data dir> <out dir> [size]
出力：human_d.webp（色）、human_n.webp（法線）
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

DATA, OUT = sys.argv[1], sys.argv[2]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
SCALE = 0.1

V, VT, faces = [], [], []
g = None
for line in open(os.path.join(DATA, '3dobjs/base.obj')):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        g = line.split()[1]
    elif line.startswith('f ') and g == 'body':
        faces.append([tuple(int(x) - 1 for x in p.split('/')[:2]) for p in line.split()[1:]])
V = np.array(V) * SCALE
V[:, 1] -= V[[i for f in faces for i, _ in f]][:, 1].min()
VT = np.array(VT)
skel = json.load(open(os.path.join(DATA, 'rigs/default.mhskel')))
jp = {k: V[v].mean(axis=0) for k, v in skel['joints'].items()}
bones = skel['bones']

def head(b):
    return jp[bones[b]['head']]

def tail(b):
    return jp[bones[b]['tail']]

# 頂点の法線
N = np.zeros_like(V)
for f in faces:
    p = [V[i] for i, _ in f]
    for k in range(1, len(p) - 1):
        N[[f[0][0], f[k][0], f[k + 1][0]]] += np.cross(p[k] - p[0], p[k + 1] - p[0])
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)

# ---------------------------------------------------------------- UV 空間へ三角形を塗る
P = np.zeros((S, S, 3), np.float32)
NN = np.zeros((S, S, 3), np.float32)
T = np.zeros((S, S, 3), np.float32)
B = np.zeros((S, S, 3), np.float32)
filled = np.zeros((S, S), bool)
for f in faces:
    for k in range(1, len(f) - 1):
        tri = [f[0], f[k], f[k + 1]]
        uv = np.array([VT[t] for _, t in tri])
        xy = np.stack([uv[:, 0] * S - 0.5, (1 - uv[:, 1]) * S - 0.5], axis=1)
        p3 = np.array([V[i] for i, _ in tri])
        n3 = np.array([N[i] for i, _ in tri])
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
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any():
            continue
        ys, xs = gy[inside], gx[inside]
        W = np.stack([w0[inside], w1[inside], w2[inside]], axis=1)
        P[ys, xs] = W @ p3
        nn = W @ n3
        NN[ys, xs] = nn / np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        # 接線：u・v が増える向きの 3D の向き
        duv1 = uv[1] - uv[0]
        duv2 = uv[2] - uv[0]
        e1 = p3[1] - p3[0]
        e2 = p3[2] - p3[0]
        r = duv1[0] * duv2[1] - duv2[0] * duv1[1]
        if abs(r) < 1e-12:
            continue
        t = (e1 * duv2[1] - e2 * duv1[1]) / r
        bb = (e2 * duv1[0] - e1 * duv2[0]) / r
        T[ys, xs] = t / max(np.linalg.norm(t), 1e-9)
        B[ys, xs] = bb / max(np.linalg.norm(bb), 1e-9)
        filled[ys, xs] = True
print('filled', filled.mean())

ys, xs = np.nonzero(filled)
p = P[ys, xs].astype(np.float64)
n = NN[ys, xs].astype(np.float64)
tt = T[ys, xs].astype(np.float64)
bb = B[ys, xs].astype(np.float64)
# 法線に直交させる
tt -= n * (tt * n).sum(1, keepdims=True)
tt /= np.maximum(np.linalg.norm(tt, axis=1, keepdims=True), 1e-9)
bb -= n * (bb * n).sum(1, keepdims=True) + tt * (bb * tt).sum(1, keepdims=True)
bb /= np.maximum(np.linalg.norm(bb, axis=1, keepdims=True), 1e-9)

# ---------------------------------------------------------------- 3D の雑音
rng = np.random.default_rng(3)
PERM = rng.permutation(256)
PERM = np.concatenate([PERM, PERM])
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
                gdot = (GR[h] * d).sum(1)
                wx = u[:, 0] if dx else 1 - u[:, 0]
                wy = u[:, 1] if dy else 1 - u[:, 1]
                wz = u[:, 2] if dz else 1 - u[:, 2]
                out = out + gdot * wx * wy * wz
    return out

def fbm(q, octaves=4):
    s, a, tot = 0, 1, 0
    for o in range(octaves):
        s = s + perlin(q * (2 ** o) + o * 17.3) * a
        tot += a
        a *= 0.5
    return s / tot

def near(c, r):
    """点 c からの近さ（0〜1、r で 0）"""
    d = np.linalg.norm(p - c, axis=1)
    return np.clip(1 - d / r, 0, 1) ** 2

def seg_near(a, b2, r):
    ab = b2 - a
    t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    d = np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
    return np.clip(1 - d / r, 0, 1) ** 2

# ---------------------------------------------------------------- 色
col = np.zeros((len(p), 3))
base = np.array([226, 200, 184]) / 255
red = np.array([212, 150, 140]) / 255
col[:] = base
blot = np.clip(fbm(p * 9) * 1.6 + 0.5, 0, 1)
col = col * (1 - 0.35 * blot[:, None]) + red * 0.35 * blot[:, None]
fine = fbm(p * 260, 2)
col *= (1 + 0.05 * fine)[:, None]
# 静脈：細い筋（腕・手・首・胸・こめかみ）
ridge = 1 - np.abs(fbm(p * 14, 3) * 2)
vein = np.clip((ridge - 0.9) / 0.1, 0, 1)
arms = sum(seg_near(head(f'upperarm01.{s}'), head(f'wrist.{s}'), 0.06) for s in 'LR')
hands = sum(near(head(f'wrist.{s}'), 0.12) for s in 'LR')
neck = seg_near(head('neck01'), head('head'), 0.07)
temples = sum(near(jp[bones[f'temporalis01.{s}']['head']] if f'temporalis01.{s}' in bones else head('head'), 0.04) for s in 'LR')
vmask = np.clip(arms + hands + neck * 0.8 + temples + 0.25, 0, 1)
col = col * (1 - 0.3 * (vein * vmask)[:, None]) + np.array([120, 135, 170]) / 255 * 0.3 * (vein * vmask)[:, None]
# 関節（ひじ・ひざ・指の節）の赤み
joints = [head(f'lowerarm01.{s}') for s in 'LR'] + [head(f'lowerleg01.{s}') for s in 'LR']
joints += [head(f'finger{i}-{j}.{s}') for i in range(2, 6) for j in (2, 3) for s in 'LR']
jr = sum(near(c, 0.035 if k < 4 else 0.012) for k, c in enumerate(joints))
col = col * (1 - 0.25 * np.clip(jr, 0, 1)[:, None]) + red * 0.85 * 0.25 * np.clip(jr, 0, 1)[:, None]
# 目のまわりのくま（紫がかった茶）
eyes = [head(f'eye.{s}') for s in 'LR']
socket = np.clip(sum(near(e + np.array([0, -0.006, 0.0]), 0.032) for e in eyes), 0, 1)
col = col * (1 - 0.35 * socket[:, None]) + np.array([120, 90, 100]) / 255 * 0.35 * socket[:, None]
# 唇
oris = [jp[bones[b]['head']] for b in bones if b.startswith('oris')]
mouth = np.mean(oris, axis=0)
dm = (p - mouth) / np.array([0.026, 0.011, 0.03])
lips = np.clip(1 - np.linalg.norm(dm, axis=1), 0, 1) ** 0.6
col = col * (1 - 0.45 * lips[:, None]) + np.array([170, 105, 105]) / 255 * 0.45 * lips[:, None]
# 爪：指先の手の甲側
nails = 0
for s in 'LR':
    for i in range(1, 6):
        tip = tail(f'finger{i}-3.{s}')
        d3 = head(f'finger{i}-3.{s}')
        axis = (tip - d3) / np.linalg.norm(tip - d3)
        m = seg_near(d3 + axis * 0.004, tip, 0.006)
        nails = nails + m
nails = np.clip(nails, 0, 1)
col = col * (1 - 0.5 * nails[:, None]) + np.array([225, 200, 195]) / 255 * 0.5 * nails[:, None]
# 足の裏・手のひらの汚れ（低い所ほど少し暗く）
low = np.clip((0.1 - p[:, 1]) / 0.1, 0, 1)
col *= (1 - 0.15 * low)[:, None]
col = np.clip(col, 0, 1)

# ---------------------------------------------------------------- 高さ → 法線
def height(q):
    h = 0.15 * fbm(q * 900, 2)  # 毛穴
    h += 0.25 * np.clip((1 - np.abs(fbm(q * 14, 3) * 2) - 0.9) / 0.1, 0, 1) * vmask  # 浮いた血管
    # 肋骨：胸の左右に、うっすら横向きの段
    chest = seg_near(head('spine03'), head('spine01'), 0.13)
    side = np.clip((np.abs(q[:, 0]) - 0.03) / 0.05, 0, 1)
    h += 0.25 * chest * side * (0.5 + 0.5 * np.sin(q[:, 1] * 2 * np.pi / 0.026))
    # 関節のしわ（ひじ・ひざ・指の節）
    h += 0.2 * np.clip(jr, 0, 1) * np.sin(q[:, 1] * 2 * np.pi / 0.004)
    return h

eps = 0.0008
dT = (height(p + tt * eps) - height(p - tt * eps)) / (2 * eps)
dB = (height(p + bb * eps) - height(p - bb * eps)) / (2 * eps)
k = 0.0012
nt = np.stack([-k * dT, -k * dB, np.ones(len(p))], axis=1)
nt /= np.linalg.norm(nt, axis=1, keepdims=True)

img_c = np.zeros((S, S, 3))
img_n = np.zeros((S, S, 3))
img_n[:] = [0.5, 0.5, 1]
img_c[ys, xs] = col
img_n[ys, xs] = nt * 0.5 + 0.5

# 島のまわりを広げる（縮小したときに、すき間の色がにじまないように）
def dilate(img, mask, n=12):
    img = img.copy()
    m = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(img)
        cnt = np.zeros(mask.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh_m = np.roll(m, (dy, dx), (0, 1))
            acc += np.roll(img, (dy, dx), (0, 1)) * sh_m[..., None]
            cnt += sh_m
        grow = (~m) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        m = m | grow
    return img

img_c = dilate(img_c, filled)
img_n = dilate(img_n, filled)
Image.fromarray((img_c * 255).astype(np.uint8)).save(os.path.join(OUT, 'human_d.webp'), 'WEBP', quality=88, method=6)
Image.fromarray((img_n * 255).astype(np.uint8)).save(os.path.join(OUT, 'human_n.webp'), 'WEBP', quality=90, method=6)
print('sizes', os.path.getsize(os.path.join(OUT, 'human_d.webp')), os.path.getsize(os.path.join(OUT, 'human_n.webp')))
