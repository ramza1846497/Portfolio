"""CMU モーションキャプチャ（BVH）を、人体モデル（human.gltf.json）の骨に移して、ゲーム用の動きの JSON を作る。

usage: python3 -I mocap_bake.py <cmu bvh dir> <human.gltf.json> <out json>

移し方（ワールドの回転の差分）：
  演者の各骨の「T ポーズからの回転の変化」を、こちらの骨にそのまま与える。
  こちらの休みの姿勢（腕を斜めに下ろした A ポーズ）と T ポーズの向きの違いは、骨ごとの補正で吸収する。
  間の骨（背骨の途中など）が違っても、ワールドの向きで合わせるので崩れない。
腰の位置：水平の移動は取り除き（ゲームが動かす）、上下・左右の揺れだけを、腰の高さとの比で残す。
繰り返す動き（歩き）は、始めと終わりの姿勢がいちばん似る所で切り、継ぎ目をなめらかにつなぐ。
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bvh import fk, parse  # noqa: E402

SRC, HUMAN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FPS = 30

# こちらの骨 ← 演者の骨（向きを決める子の骨）。手の指・親指はここに入れない（手首に付いてくる）
MAP = {
    'hips': ('Hips', 'LowerBack'),
    'spine': ('LowerBack', 'Spine1'),
    'chest': ('Spine1', 'Neck'),
    'neck': ('Neck', 'Head'),
    'head': ('Head', None),
}
for s, S in (('L', 'Left'), ('R', 'Right')):
    MAP.update({
        f'clavicle_{s}': (f'{S}Shoulder', f'{S}Arm'),
        f'upperarm_{s}': (f'{S}Arm', f'{S}ForeArm'),
        f'lowerarm_{s}': (f'{S}ForeArm', f'{S}Hand'),
        f'hand_{s}': (f'{S}Hand', f'{S}HandIndex1'),
        f'upperleg_{s}': (f'{S}UpLeg', f'{S}Leg'),
        f'lowerleg_{s}': (f'{S}Leg', f'{S}Foot'),
        f'foot_{s}': (f'{S}Foot', f'{S}ToeBase'),
    })
# 向きの違いを補正する骨（手足）。胴と頭は、そのまま回転の変化だけを与える
CORRECT = {k for k in MAP if any(p in k for p in ('clavicle', 'arm', 'hand', 'leg', 'foot'))}

# 使う動き：名前, ファイル, 始め(秒), 終わり(秒), 繰り返すか, 向きの決め方（'travel' = 進む向き、'face' = 体の正面）
CLIPS = [
    ('hunch_idle', '91_26', 0.4, 2.6, True, 'face'),
    ('zombie_walk', '104_41', 3.0, 6.0, True, 'travel'),
    ('creep_walk', '77_29', 2.0, 5.0, True, 'travel'),
    ('jump_crouch', '16_05', 0.55, 1.05, False, 'face'),
    ('jump_leap', '16_05', 1.05, 1.55, False, 'face'),
    ('jump_land', '16_05', 1.55, 2.3, False, 'face'),
    ('stumble', '22_12', 0.2, 1.3, False, 'face'),
    ('fall_face', '90_16', 2.2, 4.4, False, 'face'),
    ('stiff_walk', '104_03', 3.0, 6.0, True, 'travel'),
    ('walk', '35_01', 0.3, 2.9, True, 'travel'),
    ('chop_raise', '79_01', 0.3, 0.92, False, 'face'),
    ('chop_strike', '79_01', 0.92, 1.3, False, 'face'),
    ('chop_recover', '79_01', 1.3, 2.0, False, 'face'),
]


def quat_from_matrix(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s])
    if m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        return np.array([0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s])
    if m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        return np.array([(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s])
    s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
    return np.array([(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s])


def align(a, b):
    """向き a を向き b へ回す回転行列（どちらかの長さが 0 なら回さない）"""
    if np.linalg.norm(a) < 1e-9 or np.linalg.norm(b) < 1e-9:
        return np.eye(3)
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = np.dot(a, b)
    if c < -0.9999:
        axis = np.cross(a, [1, 0, 0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def yaw(deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


# ---------------------------------------------------------------- こちらの骨（休みの姿勢）
g = json.load(open(HUMAN))
nodes = g['nodes']
skin = g['skins'][0]
bones = [nodes[i]['name'] for i in skin['joints']]
parent = {}
for i in skin['joints']:
    for c in nodes[i].get('children', []):
        parent[nodes[c]['name']] = nodes[i]['name']
head = {}
order = []


def walk(i, base):
    n = nodes[i]
    p = base + np.array(n.get('translation', [0, 0, 0]))
    head[n['name']] = p
    order.append(n['name'])
    for c in n.get('children', []):
        if nodes[c]['name'] in bones:
            walk(c, p)


walk(skin['joints'][0], np.zeros(3))
tails = {k: np.array(v) for k, v in g['asset']['extras']['tails'].items()}
child_of = {'hips': 'spine', 'spine': 'chest', 'chest': 'neck', 'neck': 'head'}
for s in 'LR':
    child_of.update({f'clavicle_{s}': f'upperarm_{s}', f'upperarm_{s}': f'lowerarm_{s}', f'lowerarm_{s}': f'hand_{s}', f'upperleg_{s}': f'lowerleg_{s}', f'lowerleg_{s}': f'foot_{s}'})


def tdir(b):
    c = child_of.get(b)
    end = head[c] if c else tails[b]
    return end - head[b]


hips_rest_y = head['hips'][1]


def bake(name, fid, t0, t1, loop, heading):
    path = next(os.path.join(dp, f) for dp, _, fs in os.walk(SRC) for f in fs if f == f'{fid}.bvh')
    root, joints, data, ft = parse(path)
    step = 1 / FPS
    # T ポーズ（最初のフレーム）と、使う区間
    frames = [0] + [int(round((t0 + k * step) / ft)) for k in range(int(round((t1 - t0) * FPS)) + 1)]
    frames = [min(f, len(data) - 1) for f in frames]
    pos, R, idx = fk(joints, data[frames])
    T = 0
    seq = list(range(1, len(frames)))
    src_h = pos[T, idx['Hips'], 1] - min(pos[T, idx['LeftFoot'], 1], pos[T, idx['RightFoot'], 1])
    # 向き：進む向き（または体の正面）を +z にそろえる
    hp = pos[seq, idx['Hips']]
    if heading == 'travel':
        d = hp[-1] - hp[0]
        ang = np.degrees(np.arctan2(d[0], d[2]))
    else:
        lr = pos[seq[0], idx['LeftUpLeg']] - pos[seq[0], idx['RightUpLeg']]
        fwd = np.cross(lr, [0, 1, 0])
        ang = np.degrees(np.arctan2(-fwd[0], -fwd[2])) + 180
    Y = yaw(-ang)
    # 骨ごとの補正（こちらの休みの向き → 演者の T ポーズの向き）
    C = {}
    for b, (sj, sc) in MAP.items():
        if b in CORRECT and sc:
            ds = pos[T, idx[sc]] - pos[T, idx[sj]]
            C[b] = align(tdir(b), ds)
        elif b in CORRECT:
            C[b] = np.eye(3)
        else:
            C[b] = np.eye(3)
    out_q = []
    out_root = []
    # 腰の水平の動きは、1 秒の移動平均からのずれだけを残す
    win = max(1, int(FPS * 0.8))
    smooth = np.array([hp[max(0, k - win // 2):k + win // 2 + 1].mean(axis=0) for k in range(len(hp))])
    speed = np.linalg.norm((hp[-1] - hp[0])[[0, 2]]) / max(t1 - t0, 1e-3) / src_h
    for k, f in enumerate(seq):
        W = {}
        for b, (sj, _) in MAP.items():
            delta = R[f, idx[sj]] @ R[T, idx[sj]].T
            # 演者の T ポーズからの変化を与え、そのあと全体を回して進む向き（正面）を +z にそろえる
            W[b] = Y @ delta @ C[b]
        qs = []
        for b in bones:
            if b not in MAP:
                qs.append([0, 0, 0, 1])
                continue
            p = parent.get(b)
            # 親が移していない骨（指の根もとなど）のときは、たどれる親まで上がる
            while p and p not in MAP:
                p = parent.get(p)
            L = W[b] if p is None else W[p].T @ W[b]
            q = quat_from_matrix(L)
            qs.append([round(float(x), 4) for x in q / np.linalg.norm(q)])
        out_q.append(qs)
        off = Y @ (hp[k] - smooth[k])
        floor = min(pos[T, idx['LeftFoot'], 1], pos[T, idx['RightFoot'], 1])
        y = (hp[k][1] - floor) / src_h
        out_root.append([round(float(off[0] / src_h), 4), round(float(y), 4), round(float(off[2] / src_h), 4)])
    q = np.array(out_q)
    root_arr = np.array(out_root)
    if loop:
        # 始めと終わりの姿勢がいちばん似る長さで切り、最後の 0.25 秒を始めへ混ぜてつなぐ
        n = len(q)
        best, bestn = 1e9, n
        for m in range(int(n * 0.7), n):
            d = np.abs(np.abs((q[0] * q[m]).sum(-1)) - 1).sum()
            if d < best:
                best, bestn = d, m
        q = q[:bestn]
        root_arr = root_arr[:bestn]
        blend = min(int(FPS * 0.25), len(q) // 3)
        for i in range(blend):
            w = (i + 1) / (blend + 1)
            a = q[len(q) - blend + i]
            b = q[i]
            b = np.where(((a * b).sum(-1) < 0)[:, None], -b, b)
            m = a * (1 - w) + b * w
            q[len(q) - blend + i] = m / np.linalg.norm(m, axis=-1, keepdims=True)
            root_arr[len(q) - blend + i] = root_arr[len(q) - blend + i] * (1 - w) + root_arr[i] * w
    print(f'{name}: {fid} {t0}-{t1}s frames {len(q)} loop {loop} speed {speed:.2f} hips/s')
    return {
        'name': name,
        'fps': FPS,
        'loop': loop,
        'speed': round(float(speed), 3),
        'q': [round(float(x), 4) for x in np.array(q).reshape(-1)],
        'root': [round(float(x), 4) for x in root_arr.reshape(-1)],
    }


clips = [bake(*c) for c in CLIPS]
json.dump({'bones': bones, 'hipsRestY': round(float(hips_rest_y), 4), 'clips': clips, 'source': 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion by B. Hahne'}, open(OUT, 'w'), separators=(',', ':'))
print('bytes', os.path.getsize(OUT))
