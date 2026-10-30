"""MakeHuman の基本メッシュ（hm08, CC0）と標準の骨・ウェイト（CC0）から、
ゲーム用のスキン付き glTF（.gltf.json、buffer は base64 埋め込み）を作る。

usage: python3 -I mh_build.py <makehuman/data dir> <out .gltf.json>

- 骨は 163 本を 27 本にまとめる（顔の細かい骨は頭へ、指の節は根もと・先の 2 本へ）
- 体は部位ごとに別のメッシュ（服の下になる所を隠せるように）
- 服の形（タイツ・スカート）も、同じ骨で動くメッシュとして入れる
- 単位はメートル、足もとが y=0、正面は +z
"""
import base64
import json
import os
import sys
from collections import defaultdict

import numpy as np

DATA, OUT = sys.argv[1], sys.argv[2]
SCALE = 0.1  # MakeHuman の 1 = 1dm

# ---------------------------------------------------------------- OBJ
V, VT = [], []
groups = defaultdict(list)
g = None
for line in open(os.path.join(DATA, '3dobjs/base.obj')):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        g = line.split()[1]
    elif line.startswith('f '):
        groups[g].append([tuple(int(x) - 1 for x in p.split('/')[:2]) for p in line.split()[1:]])
V = np.array(V) * SCALE
VT = np.array(VT)
foot_y = V[[i for f in groups['body'] for i, _ in f]][:, 1].min()
V[:, 1] -= foot_y

# ---------------------------------------------------------------- 骨
skel = json.load(open(os.path.join(DATA, 'rigs/default.mhskel')))
mhb = skel['bones']
joint_pos = {k: V[v].mean(axis=0) for k, v in skel['joints'].items()}

def head_of(b):
    return joint_pos[mhb[b]['head']]

KEEP = {}  # MakeHuman の骨 → ゲームの骨
def keep(name, *mh):
    for m in mh:
        KEEP[m] = name

keep('hips', 'root', 'pelvis.L', 'pelvis.R')
keep('spine', 'spine05', 'spine04', 'spine03')
keep('chest', 'spine02', 'spine01', 'breast.L', 'breast.R')
keep('neck', 'neck01', 'neck02', 'neck03')
keep('head', 'head')
for s in 'LR':
    keep(f'clavicle_{s}', f'clavicle.{s}', f'shoulder01.{s}')
    keep(f'upperarm_{s}', f'upperarm01.{s}', f'upperarm02.{s}')
    keep(f'lowerarm_{s}', f'lowerarm01.{s}', f'lowerarm02.{s}')
    keep(f'hand_{s}', f'wrist.{s}', *[f'metacarpal{i}.{s}' for i in range(1, 5)])
    keep(f'thumb_{s}', *[f'finger1-{j}.{s}' for j in range(1, 4)])
    keep(f'fingers_{s}', *[f'finger{i}-1.{s}' for i in range(2, 6)])
    keep(f'fingertips_{s}', *[f'finger{i}-{j}.{s}' for i in range(2, 6) for j in (2, 3)])
    keep(f'upperleg_{s}', f'upperleg01.{s}', f'upperleg02.{s}')
    keep(f'lowerleg_{s}', f'lowerleg01.{s}', f'lowerleg02.{s}')
    keep(f'foot_{s}', f'foot.{s}')

def mapped(b):
    while b is not None and b not in KEEP:
        b = mhb[b]['parent']
    return KEEP.get(b, 'hips')

# ゲームの骨の付け根（頭の位置）と親
heads = {}
for s in 'LR':
    heads[f'fingers_{s}'] = np.mean([head_of(f'finger{i}-1.{s}') for i in range(2, 6)], axis=0)
    heads[f'fingertips_{s}'] = np.mean([head_of(f'finger{i}-2.{s}') for i in range(2, 6)], axis=0)
FIRST = {'hips': 'root', 'spine': 'spine05', 'chest': 'spine02', 'neck': 'neck01', 'head': 'head'}
for s in 'LR':
    FIRST.update({f'clavicle_{s}': f'clavicle.{s}', f'upperarm_{s}': f'upperarm01.{s}', f'lowerarm_{s}': f'lowerarm01.{s}',
                  f'hand_{s}': f'wrist.{s}', f'thumb_{s}': f'finger1-1.{s}', f'upperleg_{s}': f'upperleg01.{s}',
                  f'lowerleg_{s}': f'lowerleg01.{s}', f'foot_{s}': f'foot.{s}'})
for k, m in FIRST.items():
    heads.setdefault(k, head_of(m))
PARENT = {'hips': None, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck'}
for s in 'LR':
    PARENT.update({f'clavicle_{s}': 'chest', f'upperarm_{s}': f'clavicle_{s}', f'lowerarm_{s}': f'upperarm_{s}',
                   f'hand_{s}': f'lowerarm_{s}', f'thumb_{s}': f'hand_{s}', f'fingers_{s}': f'hand_{s}',
                   f'fingertips_{s}': f'fingers_{s}', f'upperleg_{s}': 'hips', f'lowerleg_{s}': f'upperleg_{s}',
                   f'foot_{s}': f'lowerleg_{s}'})
BONES = list(PARENT.keys())
BI = {b: i for i, b in enumerate(BONES)}
# 骨の先（形を変えるときの向き）：子の付け根、子がなければ MakeHuman の骨の先
TAIL = {}
for b in BONES:
    kids = [k for k in BONES if PARENT[k] == b and not k.startswith('thumb')]
    if b == 'chest':
        kids = ['neck']
    if b == 'hips':
        kids = ['spine']
    if kids:
        TAIL[b] = np.mean([heads[k] for k in kids], axis=0)
    else:
        last = {'head': 'head', 'fingertips_L': 'finger3-3.L', 'fingertips_R': 'finger3-3.R', 'thumb_L': 'finger1-3.L',
                'thumb_R': 'finger1-3.R', 'foot_L': 'foot.L', 'foot_R': 'foot.R'}[b]
        TAIL[b] = joint_pos[mhb[last]['tail']]

# ---------------------------------------------------------------- ウェイト
weights = json.load(open(os.path.join(DATA, 'rigs/default_weights.mhw')))['weights']
W = np.zeros((len(V), len(BONES)))
for b, lst in weights.items():
    j = BI[mapped(b)]
    for vi, w in lst:
        W[vi, j] += w
top = np.argsort(-W, axis=1)[:, :4]
topw = np.take_along_axis(W, top, axis=1)
topw /= np.maximum(topw.sum(axis=1, keepdims=True), 1e-9)
dominant = top[:, 0]

# ---------------------------------------------------------------- メッシュ
REGION = {
    'head': {'head', 'neck'},
    'torso': {'hips', 'spine', 'chest', 'clavicle_L', 'clavicle_R'},
    'upperarm': {'upperarm_L', 'upperarm_R'},
    'forearm': {'lowerarm_L', 'lowerarm_R'},
    'hand': {f'{p}_{s}' for p in ('hand', 'thumb', 'fingers', 'fingertips') for s in 'LR'},
    'thigh': {'upperleg_L', 'upperleg_R'},
    'shin': {'lowerleg_L', 'lowerleg_R'},
    'foot': {'foot_L', 'foot_R'},
}

def region_of(face):
    votes = defaultdict(float)
    for vi, _ in face:
        votes[BONES[dominant[vi]]] += 1
    bone = max(votes, key=votes.get)
    for r, s in REGION.items():
        if bone in s:
            return r
    return 'torso'

prims = defaultdict(list)
for f in groups['body']:
    prims['body_' + region_of(f)].append(f)
for f in groups['helper-tights']:
    r = region_of(f)
    prims['tights_' + {'head': 'torso', 'hand': 'forearm'}.get(r, r)].append(f)
prims['skirt'] = groups['helper-skirt']
prims['eyes'] = groups['helper-l-eye'] + groups['helper-r-eye']
prims['teeth'] = groups['helper-upper-teeth'] + groups['helper-lower-teeth']
prims['haircap'] = groups['helper-hair']

# 法線：位置が同じ頂点は同じ法線（UV の継ぎ目で陰が割れないように）。服は体と別に計算する
def normals_for(faces_all):
    n = np.zeros_like(V)
    for f in faces_all:
        p = [V[i] for i, _ in f]
        for k in range(1, len(p) - 1):
            n[[f[0][0], f[k][0], f[k + 1][0]]] += np.cross(p[k] - p[0], p[k + 1] - p[0])
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)

N_body = normals_for(groups['body'] + prims['eyes'] + prims['teeth'] + prims['haircap'])
N_cloth = normals_for(groups['helper-tights'] + groups['helper-skirt'])

buf = bytearray()
views, accessors, meshes = [], [], []

def add_view(data, target=None):
    while len(buf) % 4:
        buf.append(0)
    off = len(buf)
    buf.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target:
        v['target'] = target
    views.append(v)
    return len(views) - 1

def add_acc(arr, ctype, typ, normalized=False, minmax=False, target=34962):
    view = add_view(arr.tobytes(), target)
    a = {'bufferView': view, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if normalized:
        a['normalized'] = True
    if minmax:
        a['min'] = arr.min(axis=0).tolist()
        a['max'] = arr.max(axis=0).tolist()
    accessors.append(a)
    return len(accessors) - 1

for name, faces in prims.items():
    if not faces:
        continue
    cloth = name.startswith('tights') or name == 'skirt'
    N = N_cloth if cloth else N_body
    remap = {}
    pos, nor, uv, jnt, wts, idx = [], [], [], [], [], []
    def vid(c):
        if c not in remap:
            vi, ti = c
            remap[c] = len(pos)
            p = V[vi].copy()
            if cloth:
                # 服は肌から少し浮かせる（肌が透けて見えないように）
                p += N[vi] * 0.004
            pos.append(p)
            nor.append(N[vi])
            uv.append([VT[ti][0], 1 - VT[ti][1]] if ti >= 0 else [0, 0])
            jnt.append(top[vi])
            wts.append(topw[vi])
        return remap[c]
    for f in faces:
        ids = [vid(c) for c in f]
        for k in range(1, len(ids) - 1):
            idx += [ids[0], ids[k], ids[k + 1]]
    pos = np.array(pos, np.float32)
    nor = np.round(np.array(nor) * 127).astype(np.int8)
    nor4 = np.zeros((len(nor), 4), np.int8)
    nor4[:, :3] = nor
    uv = np.round(np.clip(np.array(uv), 0, 1) * 65535).astype(np.uint16)
    jnt = np.array(jnt, np.uint8)
    w8 = np.round(np.array(wts) * 255).astype(np.int32)
    w8[:, 0] += 255 - w8.sum(axis=1)
    w8 = w8.astype(np.uint8)
    attrs = {
        'POSITION': add_acc(pos, 5126, 'VEC3', minmax=True),
        'NORMAL': add_acc(nor4[:, :3].copy(), 5120, 'VEC3', normalized=True),
        'TEXCOORD_0': add_acc(uv, 5123, 'VEC2', normalized=True),
        'JOINTS_0': add_acc(jnt, 5121, 'VEC4'),
        'WEIGHTS_0': add_acc(w8, 5121, 'VEC4', normalized=True),
    }
    ind = add_acc(np.array(idx, np.uint16), 5123, 'SCALAR', target=34963)
    meshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind}]})
    print(name, len(pos), 'verts', len(idx) // 3, 'tris')

# 骨のノード（回転なし、付け根の位置だけ）
nodes = []
for b in BONES:
    p = heads[b] - (heads[PARENT[b]] if PARENT[b] else 0)
    n = {'name': b, 'translation': [float(x) for x in p]}
    kids = [BI[k] for k in BONES if PARENT[k] == b]
    if kids:
        n['children'] = kids
    nodes.append(n)
ibm = np.zeros((len(BONES), 16), np.float32)
for i, b in enumerate(BONES):
    m = np.eye(4, dtype=np.float32)
    m[:3, 3] = -heads[b]
    ibm[i] = m.T.reshape(-1)  # glTF は列優先
ibm_acc = add_acc(ibm, 5126, 'MAT4', target=None)
skin = {'joints': list(range(len(BONES))), 'inverseBindMatrices': ibm_acc, 'skeleton': 0}
mesh_nodes = []
for i, m in enumerate(meshes):
    nodes.append({'name': m['name'], 'mesh': i, 'skin': 0})
    mesh_nodes.append(len(nodes) - 1)
for a in accessors:
    if 'target' in views[a['bufferView']] and views[a['bufferView']]['target'] is None:
        del views[a['bufferView']]['target']
# 骨の先（形を変えるとき・IK の長さに使う）も残しておく
extras = {'tails': {b: [float(x) for x in TAIL[b]] for b in BONES}, 'source': 'MakeHuman hm08 base mesh and default rig (CC0)'}
gltf = {
    'asset': {'version': '2.0', 'generator': 'night-school mh_build.py', 'extras': extras},
    'scene': 0,
    'scenes': [{'nodes': [0] + mesh_nodes}],
    'nodes': nodes,
    'meshes': meshes,
    'skins': [skin],
    'accessors': accessors,
    'bufferViews': views,
    'buffers': [{'byteLength': len(buf), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(buf)).decode()}],
}
json.dump(gltf, open(OUT, 'w'), separators=(',', ':'))
print('bones', len(BONES), 'bytes', len(buf), 'file', os.path.getsize(OUT))
