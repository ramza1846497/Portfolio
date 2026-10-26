import type { StagePart } from '../../../game/types';
import { OZ } from '../floor1';

/**
 * 怪異その五「保健室で眠る子」（1 階・保健室）。本筋とは別の寄り道で、見つけると真のエンディングになる。
 *
 * 入り方：職員室の「保健」の机の引き出し（四桁のダイヤル錠）に保健室の鍵がある。
 *         番号は「あの子が来なくなった日」＝ 2-B の出席簿で欠席が始まる日（二月十四日）→ 0214。
 *         宿直日誌と 2-A の黒板の日付も手がかり。
 * 決まり：ベッドで眠っている人を起こしてはいけない（床に落ちた「理科室のきまり」の四番）。
 *         起こそうとすると保健室から放り出される。そっと離れると、眠っているのが誰か分かる。
 *
 * flag nurseOpen   保健室の扉を開けた
 * flag curtainOpen カーテンを開けた
 * flag truthSeen   眠っている人を起こさずに離れた（真のエンディングの条件）
 */
const CODE = ['0', '2', '1', '4'];

export const nurse: StagePart = {
  presences: [{ id: 'sleeper', x: 16.9, z: OZ + 6.1, radius: 6, strength: 0.5, when: { notFlag: 'truthSeen' } }],
  notes: [
    {
      id: 'n_nurseLocked',
      title: '保健室',
      body: '一階の保健室は施錠されている。\n扉の向こうから、誰かの寝息が聞こえる。',
    },
    {
      id: 'n_nurseKey',
      title: '保健室の鍵',
      body: '保健の先生の机の引き出しに入っていた。\nダイヤル錠の番号は「0214」……あの子が来なくなった日。',
    },
    {
      id: 'n_tornRule',
      title: '理科室のきまり　四',
      body: '保健室の床に落ちていた紙切れ。破られていた四番だ。\n「四、ほけん室で　ねている子を　おこさないこと」',
    },
    {
      id: 'n_medicine',
      title: '薬品棚',
      body: '「ねむりぐすり」のラベルの瓶が、一本だけ空になっていた。',
    },
    {
      id: 'n_sleeperWrong',
      title: '起こしてはいけない',
      body: '眠っている人に触れようとした瞬間、保健室の外に放り出された。\n「……まだ、ねてなきゃ　だめ」',
    },
    {
      id: 'n_sleeper',
      title: '保健室で眠る子',
      body: '奥のベッドで眠っていたのは、自分だった。\n今ここを歩いている自分は、いったい……。\n起こさずに、そっとしておいた。',
    },
  ],
  items: [{ id: 'nurseKey', name: '保健室の鍵' }],
  interactables: [
    {
      id: 'nurseDrawer',
      name: '保健の先生の机',
      reactions: [
        { when: { flag: 'drawerOpen' }, actions: [{ say: ['引き出しは開いている。もう何も入っていない。'] }] },
        {
          actions: [
            { say: ['「保健」の札がついた机。', '引き出しに、四桁のダイヤル錠がついている。'] },
            {
              sequence: {
                prompt: '番号を合わせる（4桁）',
                keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
                answer: CODE,
                sound: 'click',
                correct: [
                  { sfx: 'unlock' },
                  { flag: 'drawerOpen' },
                  { say: ['カチリ、と錠が外れた。', '引き出しの中に、鍵が一本。札に「保健室」とある。'] },
                  { sfx: 'pickup' },
                  { give: 'nurseKey' },
                  { note: 'n_nurseKey' },
                ],
                wrong: [{ sfx: 'locked' }, { say: ['……開かない。番号が違うらしい。'] }],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'nurseDoor',
      name: '保健室の扉',
      reactions: [
        { when: { flag: 'nurseOpen' }, actions: [{ say: ['保健室の扉。静かな寝息が聞こえる。'] }] },
        {
          when: { item: 'nurseKey' },
          actions: [
            { sfx: 'unlock' },
            { take: 'nurseKey' },
            { flag: 'nurseOpen' },
            { open: 'nurseDoor' },
            { say: ['音を立てないように、そっと扉を開けた。'] },
          ],
        },
        {
          actions: [
            { sfx: 'locked' },
            { say: ['鍵がかかっている。', '……中から、誰かの寝息が聞こえる。'] },
            { note: 'n_nurseLocked' },
          ],
        },
      ],
    },
    {
      id: 'tornRule',
      name: '紙切れ',
      reactions: [
        {
          actions: [
            { sfx: 'page' },
            { say: ['破れた紙切れだ。', '「四、ほけん室で　ねている子を　おこさないこと」', '……理科室のきまりの、破られていた四番だ。'] },
            { note: 'n_tornRule' },
          ],
        },
      ],
    },
    {
      id: 'medicine',
      name: '薬品棚',
      reactions: [
        {
          actions: [
            { say: ['ガラス戸の薬品棚。', '「ねむりぐすり」のラベルの瓶が、一本だけ空になっている。'] },
            { note: 'n_medicine' },
          ],
        },
      ],
    },
    {
      id: 'firstAidNurse',
      name: '救急箱',
      visibleWhen: { notFlag: 'firstAidNurseUsed' },
      reactions: [
        {
          actions: [
            { sfx: 'pickup' },
            { flag: 'firstAidNurseUsed' },
            { heal: 100 },
            { say: ['保健室の救急箱だ。', '消毒をして、包帯を巻いた。体が軽くなった。'] },
          ],
        },
      ],
    },
    {
      id: 'bedEmpty',
      name: 'ベッド',
      reactions: [{ actions: [{ say: ['空のベッド。シーツはきちんと整えられている。'] }] }],
    },
    {
      id: 'bedCurtain',
      name: 'カーテン',
      reactions: [
        { when: { flag: 'curtainOpen' }, actions: [{ say: ['カーテンは開いている。'] }] },
        {
          actions: [
            {
              choice: {
                prompt: '奥のベッドのカーテンだけが閉まっている。寝息は、ここから聞こえる。',
                options: [
                  {
                    label: 'そっとカーテンを開ける',
                    actions: [
                      { open: 'bedCurtain' },
                      { flag: 'curtainOpen' },
                      { say: ['音を立てないように、カーテンを開けた。', '誰かが、頭まで布団をかぶって眠っている。'] },
                    ],
                  },
                  { label: '声をかける', actions: [{ run: 'wakeSleeper' }] },
                  { label: 'やめる', actions: [] },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'sleeper',
      name: '眠っている人',
      visibleWhen: { flag: 'curtainOpen' },
      reactions: [
        { when: { flag: 'truthSeen' }, actions: [{ say: ['静かな寝息だけが聞こえる。', '……もう少し、このまま眠らせておこう。'] }] },
        {
          actions: [
            { say: ['布団から、短い黒髪がのぞいている。', '枕元に、上履きが揃えて置いてある。', '名札に書かれているのは……自分の名前だ。'] },
            { sfx: 'heartbeat' },
            {
              choice: {
                prompt: '……どうする？',
                options: [
                  { label: '布団をめくる', actions: [{ run: 'wakeSleeper' }] },
                  {
                    label: '起こさずに、そっと離れる',
                    actions: [
                      { flag: 'truthSeen' },
                      { say: ['……起こしちゃいけない。', 'そっと、ベッドから離れた。'] },
                      { sfx: 'whisper' },
                      { say: [{ text: '……もうすぐ、おきられるよ', style: 'whisper' }] },
                      { note: 'n_sleeper' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
  scripts: {
    /** 眠っている人を起こそうとした */
    wakeSleeper: [
      { sfx: 'stinger' },
      { meter: 1 },
      { fx: 'blackout' },
      { wait: 900 },
      { say: [{ text: '……まだ、ねてなきゃ　だめ', style: 'ghost' }] },
      { damage: 15 },
      { fx: 'fadeOut', duration: 0.6 },
      { fx: 'lightsOn' },
      { teleport: 'nurseOut' },
      { fx: 'shake' },
      { wait: 400 },
      { fx: 'fadeIn', duration: 1 },
      { say: ['……気がつくと、保健室の外の廊下に倒れていた。'] },
      { note: 'n_sleeperWrong' },
    ],
  },
  triggers: [
    {
      id: 'nurseEnter',
      area: { minX: 11.2, maxX: 17.8, minZ: OZ + 1.7, maxZ: OZ + 8.3 },
      when: { notFlag: 'curtainOpen' },
      actions: [{ say: ['消毒液の匂い。', '奥のベッドのカーテンだけが、閉まっている。'] }],
    },
  ],
};
