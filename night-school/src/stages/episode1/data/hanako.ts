import type { Action, InteractableDef, StagePart } from '../../../game/types';

/**
 * 怪異その一「トイレの花子さん」（2 階・女子トイレ）。
 *
 * 女子トイレは清掃中で施錠されている。鍵は音楽室のピアノ（piano.ts）から。
 *
 * 決まり：入口から三番目の個室を三回ノックし、
 *         「はなこさん、いらっしゃいますか」と呼びかける。
 *
 * 使う変数・フラグ
 *   var  knockStall  最後にノックした個室の番号（0 = なし）
 *   var  knockCount  その個室を続けてノックした回数
 *   var  failCount   決まりを破った回数
 *   flag hanakoAnswered  花子さんが返事をした
 *   flag keyAppeared     鍵が床に出ている
 */

const PHRASE = 'はなこさん、いらっしゃいますか';
const CORRECT_STALL = 3;
const CORRECT_KNOCKS = 3;

const notes: StagePart['notes'] = [
  {
    id: 'n_toiletLocked',
    title: '清掃中の女子トイレ',
    body: '二階の女子トイレは、鎖と南京錠で閉ざされている。\n札には「清掃中・立入禁止」。',
  },
  {
    id: 'n_third',
    title: '2-Aの教卓のメモ',
    body: '「はなこさんは　入口から　三番目の個室に　いる」',
  },
  {
    id: 'n_knock',
    title: '2-Bの黒板',
    body: `「ノックは三回。そのあと『${PHRASE}』」`,
  },
  {
    id: 'n_locker',
    title: '掃除当番表',
    body: '用具入れの扉の裏。\n「三番目の個室は使わないこと」と赤字で書き足されている。',
  },
  {
    id: 'n_wrong',
    title: '呼び方を間違えると',
    body: '手順を間違えると、明かりが乱れ、子どもの笑い声がする。\nノックは最初から数え直しになるようだ。',
  },
  {
    id: 'n_hanako',
    title: '花子さんの決まり',
    body: `入口から三番目の個室を三回ノックし、\n「${PHRASE}」と呼ぶと……返事があった。`,
  },
  {
    id: 'n_key',
    title: '昇降口の鍵',
    body: '三番目の個室に落ちていた古い鍵。札に「昇降口」とある。',
  },
];

const items: StagePart['items'] = [{ id: 'exitKey', name: '昇降口の鍵' }];

/** 個室 n の「ノックする／呼びかける」メニュー */
function stallMenu(n: number): Action[] {
  return [
    {
      choice: {
        prompt: `入口から${n}番目の個室。扉は閉まっている。`,
        options: [
          { label: 'ノックする', actions: [{ run: `knock${n}` }] },
          { label: '呼びかける', actions: [{ run: `call${n}` }] },
          { label: 'やめる', actions: [] },
        ],
      },
    },
  ];
}

function knock(n: number): Action[] {
  return [
    // 別の個室をノックしたら、そこから数え直し
    {
      if: { var: 'knockStall', ne: n },
      then: [
        { setVar: 'knockStall', value: n },
        { setVar: 'knockCount', value: 0 },
      ],
    },
    { addVar: 'knockCount', value: 1 },
    { sfx: 'knock' },
    { say: [{ text: 'コン……（{knockCount}回）', style: 'system' }] },
    { run: `menu${n}` },
  ];
}

function call(n: number): Action[] {
  const correct: Action[] =
    n === CORRECT_STALL
      ? [
          {
            if: {
              all: [
                { note: 'n_knock' },
                { var: 'knockStall', eq: CORRECT_STALL },
                { var: 'knockCount', eq: CORRECT_KNOCKS },
              ],
            },
            then: [{ run: 'hanakoAppears' }],
            else: [{ run: 'hanakoWrong' }],
          },
        ]
      : [{ run: 'hanakoWrong' }];
  return [
    {
      if: { note: 'n_knock' },
      then: [{ say: [{ speaker: 'あなた', text: `「${PHRASE}」` }] }],
      else: [{ say: [{ speaker: 'あなた', text: '「……誰か、いますか？」' }] }],
    },
    ...correct,
  ];
}

function stall(n: number): InteractableDef {
  return {
    id: `stall${n}`,
    name: `個室（入口から${n}番目）`,
    reactions: [
      {
        when: { flag: 'hanakoAnswered' },
        actions: [
          {
            say: [n === CORRECT_STALL ? '扉は開いたままだ。中には誰もいない。' : '扉は閉まっている。もう、何の気配もしない。'],
          },
        ],
      },
      { actions: [{ run: `menu${n}` }] },
    ],
  };
}

const scripts: StagePart['scripts'] = {
  /** 決まりを破ったとき */
  hanakoWrong: [
    { wait: 500 },
    { sfx: 'laugh' },
    { fx: 'strobe', duration: 1.8 },
    { fx: 'shake' },
    { wait: 1200 },
    { say: [{ text: 'クスクスクス……', style: 'ghost' }] },
    { damage: 10 },
    { setVar: 'knockStall', value: 0 },
    { setVar: 'knockCount', value: 0 },
    { addVar: 'failCount', value: 1 },
    {
      if: { var: 'failCount', eq: 1 },
      then: [
        { say: ['……どこからか、子どもの笑い声がした。', '何かを、間違えたらしい。'] },
        { note: 'n_wrong' },
      ],
      else: [{ say: ['……また、間違えたらしい。'] }],
    },
  ],

  /** 正しい手順で呼んだとき */
  hanakoAppears: [
    { wait: 900 },
    { fx: 'blackout' },
    { wait: 1800 },
    { sfx: 'hai' },
    { meter: 1 },
    { wait: 300 },
    { say: [{ speaker: '？？？', text: 'はあい', style: 'ghost' }] },
    { wait: 700 },
    { sfx: 'creak' },
    { open: 'stall3' },
    { wait: 1600 },
    // 明かりが戻った一瞬だけ、個室の中に少女が立っている
    { flag: 'hanakoShow' },
    { fx: 'lightsOn' },
    { look: 'hanakoFigure' },
    { wait: 500 },
    { fx: 'flashFlicker', duration: 0.4 },
    { wait: 350 },
    { flag: 'hanakoShow', value: false },
    { flag: 'hanakoAnswered' },
    { flag: 'keyAppeared' },
    { note: 'n_hanako' },
    {
      say: ['……今、誰かいた。', '三番目の個室の扉が、ひとりでに開いている。', '中には誰もいない。……床に、何か光る物が落ちている。'],
    },
  ],

  ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [
    [`menu${n}`, stallMenu(n)],
    [`knock${n}`, knock(n)],
    [`call${n}`, call(n)],
  ])),
};

const interactables: InteractableDef[] = [
  {
    id: 'toiletDoor',
    name: '女子トイレの扉',
    reactions: [
      { when: { flag: 'toiletOpen' }, actions: [{ say: ['扉は開いている。中はひんやりしている。'] }] },
      {
        when: { item: 'toiletKey' },
        actions: [
          { sfx: 'unlock' },
          { take: 'toiletKey' },
          { flag: 'toiletOpen' },
          { open: 'toiletDoor' },
          { sfx: 'creak' },
          { say: ['南京錠が外れ、鎖が床に落ちた。', '扉が、内側へゆっくりと開いていく。'] },
        ],
      },
      {
        actions: [
          { sfx: 'locked' },
          { say: ['扉の取っ手に鎖が巻かれ、南京錠がかかっている。', '「清掃中・立入禁止」……こんな夜中に？', '……扉の向こうで、水の落ちる音がする。'] },
          { note: 'n_toiletLocked' },
        ],
      },
    ],
  },
  {
    id: 'podium2a',
    name: '2-Aの教卓',
    reactions: [
      { when: { note: 'n_third' }, actions: [{ say: ['教卓だ。メモはもう読んだ。'] }] },
      { actions: [{ say: ['教卓の上に、メモが一枚置いてある。'] }] },
    ],
  },
  {
    id: 'memo2a',
    name: '教卓のメモ',
    reactions: [
      { when: { note: 'n_third' }, actions: [{ say: ['「はなこさんは　入口から　三番目の個室に　いる」'] }] },
      {
        actions: [
          { sfx: 'page' },
          { say: ['子どもの字で、何か書いてある。', '「はなこさんは　入口から　三番目の個室に　いる」'] },
          { note: 'n_third' },
        ],
      },
    ],
  },
  {
    id: 'blackboard2b',
    name: '2-Bの黒板',
    reactions: [
      { when: { note: 'n_knock' }, actions: [{ say: [`「ノックは三回。そのあと『${PHRASE}』」`] }] },
      {
        actions: [
          { say: ['黒板いっぱいに、白いチョークで書かれている。', 'ノックは　三回', `そのあと「${PHRASE}」`, '……呼び出し方、だろうか。'] },
          { note: 'n_knock' },
        ],
      },
    ],
  },
  stall(1),
  stall(2),
  stall(3),
  stall(4),
  {
    id: 'mirror',
    name: '鏡',
    reactions: [
      { when: { flag: 'hanakoAnswered' }, actions: [{ say: ['鏡には、自分の顔しか映っていない。'] }] },
      {
        when: { var: 'failCount', gte: 1 },
        actions: [
          { fx: 'flashFlicker', duration: 0.6 },
          { sfx: 'stinger' },
          { say: ['……！', '一瞬、自分の後ろに、おかっぱ頭の女の子が映った気がした。'] },
        ],
      },
      { actions: [{ say: ['ひどく曇った鏡。', '自分の顔が、ぼんやりと映っている。'] }] },
    ],
  },
  {
    id: 'sink',
    name: '洗面台',
    reactions: [{ actions: [{ sfx: 'drip' }, { say: ['蛇口から、ぽたり、ぽたりと水が落ちている。', 'きつく締めても、止まらない。'] }] }],
  },
  {
    id: 'locker',
    name: '用具入れ',
    reactions: [
      { when: { note: 'n_locker' }, actions: [{ say: ['「三番目の個室は使わないこと」……'] }] },
      {
        actions: [
          { say: ['掃除用具入れ。モップとバケツが入っている。', '扉の裏に、掃除当番表が貼ってある。', '下の方に、赤い字で書き足しがある。', '「三番目の個室は　使わないこと」'] },
          { note: 'n_locker' },
        ],
      },
    ],
  },
  {
    id: 'key',
    name: '古びた鍵',
    visibleWhen: { flag: 'keyAppeared' },
    reactions: [
      {
        actions: [
          { sfx: 'pickup' },
          { flag: 'keyAppeared', value: false },
          { give: 'exitKey' },
          { note: 'n_key' },
          { say: ['古びた鍵だ。札に「昇降口」と書いてある。'] },
          { wait: 500 },
          { fx: 'flashFlicker', duration: 0.7 },
          { say: [{ text: '……また、あそぼうね', style: 'whisper' }] },
        ],
      },
    ],
  },
];

export const hanako: StagePart = {
  notes,
  items,
  interactables,
  scripts,
  presences: [{ id: 'hanako', x: 10.1, z: 7.6, radius: 7, strength: 0.7, when: { notFlag: 'hanakoAnswered' } }],
  visibility: [
    { id: 'hanakoFigure', when: { flag: 'hanakoShow' } },
    { id: 'toiletChain', when: { notFlag: 'toiletOpen' } },
  ],
};
