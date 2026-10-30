"""mh_build.py と mh_paint.py で共通に使う：MakeHuman の基本メッシュの読み込みと、服の UV。

服（タイツ・スカート）の元の UV は画像の隅に小さく詰め込まれていて、汚れや破れを描けない。
そこで部位ごとに、体（または手足）の軸のまわりの円筒に展開した UV を作り、1 枚の画像の区画に並べる。
"""
import json
import os
from collections import defaultdict

import numpy as np

SCALE = 0.1  # MakeHuman の 1 = 1dm


def load(data):
    V, VT = [], []
    groups = defaultdict(list)
    g = None
    for line in open(os.path.join(data, '3dobjs/base.obj')):
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            g = line.split()[1]
        elif line.startswith('f '):
            groups[g].append([tuple(int(x) - 1 for x in p.split('/')[:2]) for p in line.split()[1:]])
    V = np.array(V) * SCALE
    V[:, 1] -= V[[i for f in groups['body'] for i, _ in f]][:, 1].min()
    skel = json.load(open(os.path.join(data, 'rigs/default.mhskel')))
    jp = {k: V[v].mean(axis=0) for k, v in skel['joints'].items()}
    return V, np.array(VT), groups, skel, jp


# 区画（u0, v0, u1, v1）。v は画像の上が 0（glTF の向き）
RECTS = {
    'torso': (0.0, 0.0, 1.0, 0.3),
    'skirt': (0.0, 0.3, 1.0, 0.55),
    'thigh_L': (0.0, 0.55, 0.5, 0.72),
    'thigh_R': (0.5, 0.55, 1.0, 0.72),
    'shin_L': (0.0, 0.72, 0.5, 0.86),
    'shin_R': (0.5, 0.72, 1.0, 0.86),
    'arm_L': (0.0, 0.86, 0.5, 0.97),
    'arm_R': (0.5, 0.86, 1.0, 0.97),
    'foot': (0.0, 0.97, 1.0, 1.0),
}
MARGIN = 0.03


def cloth_uv_maker(jp, bones):
    """服の頂点 → (区画名, u, v)。部位（prim の名前）と左右で軸を選ぶ"""
    def head(b):
        return jp[bones[b]['head']]
    axes = {}
    for s in 'LR':
        sh = head(f'upperarm01.{s}')
        wr = head(f'wrist.{s}')
        axes[f'arm_{s}'] = (sh, wr)
        hip = head(f'upperleg01.{s}')
        knee = head(f'lowerleg01.{s}')
        ank = head(f'foot.{s}')
        axes[f'thigh_{s}'] = (hip, knee)
        axes[f'shin_{s}'] = (knee, ank)
    top = head('neck01')
    pel = head('root')
    axes['torso'] = (top, pel - np.array([0, 0.25, 0]))
    axes['skirt'] = (pel + np.array([0, 0.12, 0]), np.array([pel[0], 0.0, pel[2]]))

    def rect_of(prim, p):
        side = 'L' if p[0] > 0 else 'R'
        if prim == 'skirt':
            return 'skirt'
        if prim == 'tights_torso':
            return 'torso'
        if prim in ('tights_upperarm', 'tights_forearm'):
            return f'arm_{side}'
        if prim == 'tights_thigh':
            return f'thigh_{side}'
        if prim == 'tights_shin':
            return f'shin_{side}'
        return 'foot'

    def uv(rect, p):
        a, b = axes.get(rect, axes['torso'])
        ax = b - a
        L = np.linalg.norm(ax)
        ax = ax / L
        t = np.clip((p - a) @ ax / L, 0, 1)
        # 軸に直交する面で、前（+z）を基準に角度を測る
        ref = np.array([0, 0, 1.0]) - ax * ax[2]
        ref /= np.linalg.norm(ref)
        side = np.cross(ax, ref)
        d = p - a - ax * ((p - a) @ ax)
        ang = np.arctan2(d @ side, d @ ref)  # -π〜π、前が 0、継ぎ目は背中（内側）
        u0, v0, u1, v1 = RECTS[rect]
        uu = u0 + MARGIN * (u1 - u0) + (ang / (2 * np.pi) + 0.5) * (u1 - u0) * (1 - 2 * MARGIN)
        vv = v0 + MARGIN * (v1 - v0) + t * (v1 - v0) * (1 - 2 * MARGIN)
        return uu, vv

    return rect_of, uv


def face_uvs(prim, face, V, rect_of, uv):
    """面の頂点の UV（継ぎ目をまたぐ面は、同じ区画の外へはみ出す向きにずらす）"""
    c = np.mean([V[i] for i, _ in face], axis=0)
    rect = rect_of(prim, c)
    uvs = [list(uv(rect, V[i])) for i, _ in face]
    u0, _, u1, _ = RECTS[rect]
    w = u1 - u0
    us = [q[0] for q in uvs]
    if max(us) - min(us) > w * 0.5:
        for q in uvs:
            if q[0] < u0 + w * 0.5:
                q[0] += w * (1 - 2 * MARGIN)
    return uvs
