"""BVH（モーションキャプチャ）の読み込みと順運動学。mocap_bake.py と下見用の絵で使う。"""
import re

import numpy as np


class Joint:
    def __init__(self, name, parent):
        self.name = name
        self.parent = parent
        self.offset = np.zeros(3)
        self.channels = []
        self.children = []
        self.end = None  # 末端の先（End Site）


def parse(path):
    text = open(path).read()
    tokens = re.split(r'\s+', text.strip())
    i = 0
    joints = []
    stack = []
    root = None
    while tokens[i] != 'MOTION':
        t = tokens[i]
        if t in ('ROOT', 'JOINT'):
            j = Joint(tokens[i + 1], stack[-1] if stack else None)
            if j.parent:
                j.parent.children.append(j)
            else:
                root = j
            joints.append(j)
            stack.append(j)
            i += 2
        elif t == 'End':
            # End Site { OFFSET x y z }
            stack[-1].end = np.array([float(x) for x in tokens[i + 4:i + 7]])
            i += 8
        elif t == 'OFFSET':
            stack[-1].offset = np.array([float(x) for x in tokens[i + 1:i + 4]])
            i += 4
        elif t == 'CHANNELS':
            n = int(tokens[i + 1])
            stack[-1].channels = tokens[i + 2:i + 2 + n]
            i += 2 + n
        elif t == '}':
            stack.pop()
            i += 1
        else:
            i += 1
    nframes = int(tokens[i + 2])
    ft = float(tokens[i + 5])
    data = np.array([float(x) for x in tokens[i + 6:]]).reshape(nframes, -1)
    return root, joints, data, ft


def rot(axis, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    if axis == 'X':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'Y':
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def fk(joints, data):
    """各フレームの、関節のワールド位置 (F, J, 3) と回転 (F, J, 3, 3)"""
    F = len(data)
    J = len(joints)
    idx = {j.name: k for k, j in enumerate(joints)}
    pos = np.zeros((F, J, 3))
    R = np.zeros((F, J, 3, 3))
    col = 0
    cols = {}
    for j in joints:
        cols[j.name] = (col, j.channels)
        col += len(j.channels)
    for f in range(F):
        for k, j in enumerate(joints):
            c0, chans = cols[j.name]
            local = np.eye(3)
            t = j.offset.copy()
            for n, ch in enumerate(chans):
                v = data[f, c0 + n]
                if ch.endswith('position'):
                    t[{'X': 0, 'Y': 1, 'Z': 2}[ch[0]]] = v + (0 if j.parent else 0)
                else:
                    local = local @ rot(ch[0], v)
            if j.parent is None:
                R[f, k] = local
                pos[f, k] = t
            else:
                p = idx[j.parent.name]
                R[f, k] = R[f, p] @ local
                pos[f, k] = pos[f, p] + R[f, p] @ j.offset
    return pos, R, idx
