import type { StagePart } from '../../../game/types';
import { OZ } from '../floor1';

/**
 * 怪異その二「動く人体模型」（1 階・理科室）。
 * 動きそのものは ../model.ts（actor）に書いてある。
 *
 * 決まり：人体模型は、なくした心臓を探して歩く。画面に映っている間は動けない。
 *         背を向けると近づいてきて、捕まると体力が減る。心臓を返すと止まる。
 *
 * flag modelSeen     人体模型を調べた
 * flag heartTaken    落とし物箱から心臓を取った
 * flag modelHunting  人体模型が動き出した（理科室に入った時点）
 * flag modelCalm     心臓を返した（もう動かない）
 */
export const model: StagePart = {
  // 動き出す前の、理科室の奥の気配（動き出してからは actor がメーターを振らせる）
  presences: [{ id: 'modelIdle', x: 24.6, z: OZ - 8.4, radius: 8, strength: 0.4, when: { notFlag: 'modelHunting' } }],
  notes: [
    {
      id: 'n_model',
      title: '人体模型',
      body: '理科室の奥の人体模型。左胸の心臓の部品がない。\n右手に「音楽室」の札がついた鍵を握っている。',
    },
    {
      id: 'n_scienceRule',
      title: '理科室のきまり',
      body: '「三、人体模型から　目をはなさない」\n……なぜ、そんなきまりが？',
    },
    {
      id: 'n_heart',
      title: '作り物の心臓',
      body: '職員室の落とし物箱に入っていた、人体模型の心臓。\nこれを返せば、あれは止まるはずだ。',
    },
    {
      id: 'n_modelRule',
      title: '人体模型の決まり',
      body: '背を向けると、近づいてくる。見ている間は動かない。\n捕まると、首を絞められる。心臓を返せば、止まるはずだ。',
    },
    {
      id: 'n_musicKey',
      title: '音楽室の鍵',
      body: '人体模型が握っていた鍵。心臓を返すと、指がほどけた。',
    },
  ],
  items: [
    { id: 'heart', name: '人体模型の心臓' },
    { id: 'musicKey', name: '音楽室の鍵' },
  ],
  interactables: [
    {
      id: 'model',
      name: '人体模型',
      reactions: [
        { when: { flag: 'modelCalm' }, actions: [{ say: ['人体模型は、もう動かない。', '左胸に、心臓が収まっている。'] }] },
        {
          when: { item: 'heart' },
          actions: [
            {
              choice: {
                prompt: '人体模型が、こちらを見下ろしている。',
                options: [
                  {
                    label: '心臓を返す',
                    actions: [
                      { take: 'heart' },
                      { flag: 'modelCalm' },
                      { sfx: 'thud' },
                      { say: ['左胸の穴に、心臓をはめ込んだ。', 'カチリ、と音がした。'] },
                      { wait: 600 },
                      { sfx: 'pickup' },
                      { say: ['握りしめられていた右手の指が、ゆっくりとほどけていく。', '……鍵が落ちた。'] },
                      { give: 'musicKey' },
                      { note: 'n_musicKey' },
                    ],
                  },
                  { label: 'やめる', actions: [] },
                ],
              },
            },
          ],
        },
        {
          actions: [
            { flag: 'modelSeen' },
            {
              say: [
                '理科室の人体模型だ。半分だけ、皮膚がはがされている。',
                '左胸に、ぽっかりと穴が開いている。心臓の部品がない。',
                '右手に、何か握っている。……鍵だ。札に「音楽室」とある。',
                '指が固く閉じていて、外れない。',
              ],
            },
            { note: 'n_model' },
          ],
        },
      ],
    },
    {
      id: 'scienceRule',
      name: '理科室のきまり',
      reactions: [
        {
          actions: [
            { say: ['「理科室のきまり」', '一、薬品にさわらない。二、走らない。', '三、人体模型から　目をはなさない。'] },
            {
              if: { note: 'n_tornRule' },
              then: [{ say: ['四は破られている。……保健室に落ちていた紙切れが、その四番だ。'] }],
              else: [{ say: ['四は、破られていて読めない。'] }],
            },
            { note: 'n_scienceRule' },
          ],
        },
      ],
    },
    {
      id: 'specimens',
      name: '標本の棚',
      reactions: [{ actions: [{ say: ['ホルマリン漬けの標本が並んでいる。', 'びんの中の何かと、目が合った気がした。'] }] }],
    },
    {
      id: 'blackboardScience',
      name: '理科室の黒板',
      reactions: [
        { when: { flag: 'modelCalm' }, actions: [{ say: ['てこの原理。支点・力点・作用点。', '隅の小さな字が「みつけてくれて　ありがとう」に変わっている。'] }] },
        { actions: [{ say: ['てこの原理。支点・力点・作用点。', '隅に小さく「もうすぐ　みつかるよ」と書いてある。'] }] },
      ],
    },
    {
      id: 'lostbox',
      name: '落とし物箱',
      reactions: [
        { when: { flag: 'heartTaken' }, actions: [{ say: ['落とし物箱。もう何も入っていない。'] }] },
        {
          actions: [
            { say: ['職員室の落とし物箱。', '……体操服、名札、片方だけの上履き。', 'いちばん底に、作り物の心臓が入っている。人体模型の部品だ。'] },
            { sfx: 'pickup' },
            { give: 'heart' },
            { flag: 'heartTaken' },
            { note: 'n_heart' },
            {
              if: { all: [{ flag: 'modelHunting' }, { notFlag: 'modelCalm' }] },
              then: [{ say: ['……これを返せば、あれは止まるはずだ。', '目を離さずに、近づかないと。'] }],
              else: [{ say: ['人体模型の心臓……理科室の人体模型のものだろうか。'] }],
            },
          ],
        },
      ],
    },
  ],
  scripts: {
    /** 背を向けたすきに捕まった */
    modelCaught: [
      { sfx: 'stinger' },
      { fx: 'strobe', duration: 1 },
      { look: 'model' },
      { say: ['……！', '冷たく硬い指が、首にかかった——'] },
      { damage: 35 },
      { fx: 'flashFlicker', duration: 0.6 },
      { actor: 'model', command: 'reset' },
      { addVar: 'caughtCount', value: 1 },
      {
        if: { var: 'caughtCount', eq: 1 },
        then: [
          { say: ['……なんとか振りほどいた。', '瞬きした隙に、人体模型は消えていた。……理科室へ戻ったのか。', 'あれは、見ていないときに動く。背を向けちゃいけない。'] },
          { note: 'n_modelRule' },
        ],
        else: [{ say: ['……また、捕まった。', '目を離さずに近づいて、心臓を返さないと。'] }],
      },
    ],
  },
  triggers: [
    {
      // 理科室に入ると、人体模型が動き出す
      id: 'scienceEnter',
      area: { minX: 14.2, maxX: 25.8, minZ: OZ - 9.4, maxZ: OZ - 1.6 },
      when: { all: [{ notFlag: 'modelHunting' }, { notFlag: 'modelCalm' }] },
      actions: [
        { say: ['……薬品の匂い。', '奥の暗がりに、誰かが立っている——'] },
        { look: 'model' },
        { meter: 0.9 },
        { sfx: 'thud' },
        { fx: 'flashFlicker', duration: 0.6 },
        { say: ['……人体模型だ。', '今、首がこちらを向いた……？'] },
        { flag: 'modelHunting' },
        { say: [{ text: '怪異メーターが振れている。……目を離さないほうがいい。', style: 'system' }] },
      ],
    },
  ],
  visibility: [
    { id: 'heartObj', when: { notFlag: 'heartTaken' } },
    { id: 'modelHeart', when: { flag: 'modelCalm' } },
    { id: 'modelKey', when: { notFlag: 'modelCalm' } },
  ],
};
