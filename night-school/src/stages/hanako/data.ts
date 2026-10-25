import type { Action, InteractableDef, ItemDef, NoteDef, StageDef } from '../../game/types';

/**
 * 第一話「トイレの花子さん」のデータ。
 * 調べられる物・会話文・フラグ条件はすべてここに書く（コードは触らない）。
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

export const notes: NoteDef[] = [
  {
    id: 'n_exit',
    title: '閉ざされた昇降口',
    body: '昇降口は鎖と南京錠で閉ざされている。\n鍵がなければ外には出られない。',
  },
  {
    id: 'n_seven',
    title: '学校の七不思議',
    body: '掲示板の古い貼り紙。\n一つ目は「トイレの花子さん」。名前が赤い丸で囲まれていた。',
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
    id: 'n_roll',
    title: '2-Bの出席簿',
    body: '最後の欄に、名字のない「花子」という名前。\n欠席の印が、何十年分も続いている。',
  },
  {
    id: 'n_wrong',
    title: '決まりを破ると',
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

export const items: ItemDef[] = [{ id: 'exitKey', name: '昇降口の鍵' }];

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
            else: [{ run: 'wrong' }],
          },
        ]
      : [{ run: 'wrong' }];
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

const scripts: StageDef['scripts'] = {
  intro: [
    { fx: 'fadeIn', duration: 2.5 },
    {
      say: [
        '……ここは。',
        '学校の、廊下だ。',
        'いつの間に眠っていたんだろう。窓の外は、もう真っ暗だ。',
        '早く帰らないと。……昇降口は、すぐ後ろの突き当たりだったはずだ。',
      ],
    },
    { say: [{ text: '目的：校舎から脱出する', style: 'system' }] },
  ],

  /** 決まりを破ったとき */
  wrong: [
    { wait: 500 },
    { sfx: 'laugh' },
    { fx: 'strobe', duration: 1.8 },
    { fx: 'shake' },
    { wait: 1200 },
    { say: [{ text: 'クスクスクス……', style: 'ghost' }] },
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
    { wait: 300 },
    { say: [{ speaker: '？？？', text: 'はあい', style: 'ghost' }] },
    { wait: 700 },
    { sfx: 'creak' },
    { open: 'stall3' },
    { wait: 1600 },
    { fx: 'lightsOn' },
    { flag: 'hanakoAnswered' },
    { flag: 'keyAppeared' },
    { note: 'n_hanako' },
    {
      say: ['……明かりが戻った。', '三番目の個室の扉が、ひとりでに開いている。', '中には誰もいない。……床に、何か光る物が落ちている。'],
    },
  ],

  ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [
    [`menu${n}`, stallMenu(n)],
    [`knock${n}`, knock(n)],
    [`call${n}`, call(n)],
  ])),
};

export const interactables: InteractableDef[] = [
  {
    id: 'exit',
    name: '昇降口の扉',
    reactions: [
      {
        when: { item: 'exitKey' },
        actions: [
          { sfx: 'unlock' },
          { say: ['鍵を差し込むと、重たい音を立てて回った。', '鎖が床に落ちる。'] },
          { sfx: 'creak' },
          { fx: 'fadeOut', duration: 2 },
          { clear: true },
        ],
      },
      {
        when: { note: 'n_exit' },
        actions: [{ sfx: 'locked' }, { say: ['やはり開かない。鍵を探さないと。'] }],
      },
      {
        actions: [
          { sfx: 'locked' },
          { say: ['……開かない。', '扉の取っ手に鎖が巻かれ、南京錠で閉ざされている。', 'どこかに、鍵があるはずだ。'] },
          { note: 'n_exit' },
        ],
      },
    ],
  },
  {
    id: 'barricade',
    name: '積まれた机',
    reactions: [
      {
        actions: [{ say: ['机が天井近くまで積み上げられていて、階段を降りられない。', '……誰が、こんなことを。'] }],
      },
    ],
  },
  {
    id: 'window',
    name: '窓',
    reactions: [{ actions: [{ say: ['窓の外は、山の影と星だけ。', '鍵が錆びついていて、びくともしない。'] }] }],
  },
  {
    id: 'board',
    name: '掲示板',
    reactions: [
      { when: { note: 'n_seven' }, actions: [{ say: ['七不思議の貼り紙。一つ目は「トイレの花子さん」。'] }] },
      {
        actions: [
          {
            say: [
              '掲示板に、古い貼り紙がある。',
              '「学校の七不思議」……',
              '一、トイレの花子さん。二、動く人体模型。三、音楽室のピアノ……',
              '五つ目から先は、かすれて読めない。',
              '花子さんの名前だけが、赤い丸で囲まれている。',
            ],
          },
          { note: 'n_seven' },
        ],
      },
    ],
  },
  {
    id: 'blackboard2a',
    name: '2-Aの黒板',
    reactions: [{ actions: [{ say: ['日付と「自習」の文字。', '日直の名前のところだけ、きれいに消されている。'] }] }],
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
  {
    id: 'podium2b',
    name: '2-Bの教卓',
    reactions: [
      { when: { note: 'n_roll' }, actions: [{ say: ['出席簿が入っている。もう見たくない。'] }] },
      {
        actions: [
          { say: ['引き出しに出席簿が入っている。', '最後の欄に……名字のない「花子」という名前。', '欠席の印が、ずっと、ずっと続いている。'] },
          { fx: 'flashFlicker', duration: 0.5 },
          { note: 'n_roll' },
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

export { scripts };

export const objectives: StageDef['objectives'] = [
  { when: { item: 'exitKey' }, text: '昇降口から脱出する' },
  { when: { flag: 'keyAppeared' }, text: '三番目の個室を調べる' },
  { when: { all: [{ note: 'n_third' }, { note: 'n_knock' }] }, text: '女子トイレで花子さんを呼び出す' },
  { when: { note: 'n_seven' }, text: '花子さんについて調べる' },
  { when: { note: 'n_exit' }, text: '鍵を探す（校舎を調べてみる）' },
  { text: '校舎から脱出する' },
];
