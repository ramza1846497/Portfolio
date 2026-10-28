import type { StageDef, StagePart } from '../../../game/types';

/**
 * 戦闘：剣道部の竹刀と、敵（影の子ども・走る二宮金次郎像）。
 * 敵の動きは game/combat.ts、ここでは見つけ方・出来事・説明を決める。
 *
 * 最初の敵：2 階の西階段の前にうずくまる影。竹刀を持って近づくと遭遇イベント → 操作説明 → 戦闘。
 * 倒すまで西階段（十三階段）は使えない。
 *
 * flag shadow1Awake  最初の影が動き出した
 * flag shadow1Dead   最初の影を倒した
 */
export const combat: StagePart = {
  items: [{ id: 'shinai', name: '剣道部の竹刀' }],
  notes: [
    {
      id: 'n_shadowSeen',
      title: 'うずくまる影',
      body: '二階の西階段の前に、黒い影がうずくまっている。\n素手で近づいてはいけない気がする。身を守れる物があれば……。',
    },
    {
      id: 'n_shinai',
      title: '剣道部の竹刀',
      body: '2-B の後ろの扉の脇に立てかけてあった。\n握ると、少しだけ心強い。',
    },
    {
      id: 'n_shadow',
      title: '影の子ども',
      body: '子どもくらいの背丈の、煙のような影。赤い目が二つ。\n体が赤く光ると、飛びかかってくる。竹刀で何度か叩くと、ほどけて消えた。',
    },
  ],
  interactables: [
    {
      id: 'shinai',
      name: '竹刀',
      visibleWhen: { noItem: 'shinai' },
      reactions: [
        {
          actions: [
            { sfx: 'pickup' },
            { give: 'shinai' },
            { say: ['剣道部の竹刀だ。防具袋と一緒に、置き忘れられている。', '……握ると、少しだけ心強い。'] },
            { note: 'n_shinai' },
          ],
        },
      ],
    },
    {
      id: 'shadow1Look',
      name: '黒い影',
      visibleWhen: { notFlag: 'shadow1Awake' },
      reactions: [
        {
          when: { noItem: 'shinai' },
          actions: [
            { meter: 0.7 },
            { say: ['階段の前に、黒い影がうずくまっている。', '……近づこうとすると、足がすくんで動かない。', '素手では無理だ。何か、身を守れる物を探そう。'] },
            { note: 'n_shadowSeen' },
          ],
        },
        { actions: [{ run: 'firstEncounter' }] },
      ],
    },
  ],
  scripts: {
    /** 最初の敵との遭遇：動きはムービーで見せ、言葉は心情だけ。そのあと操作説明 */
    firstEncounter: [
      { look: 'shadow1' },
      { meter: 0.95 },
      { sfx: 'growl' },
      { fx: 'flashFlicker', duration: 0.6 },
      { say: ['……うずくまっていた影が、ゆっくりと立ち上がった。'] },
      { movie: 'shadow' },
      { say: ['……階段は、あいつの後ろだ。', '竹刀を握る手に、汗がにじむ。やるしかない。'] },
      { tutorial: 'combat' },
      { unblock: 'shadowBlock' },
      { flag: 'shadow1Awake' },
    ],
    shadow1Defeated: [
      { flag: 'shadow1Dead' },
      { say: ['……影は、煙のようにほどけて消えた。', '手のひらが、まだ震えている。', 'この学校には、まだ「ああいうもの」がいるのかもしれない。'] },
      { note: 'n_shadow' },
      { hint: '攻撃を受けると体力が減る。救急箱で回復できる', duration: 4 },
    ],
  },
  triggers: [
    {
      // 竹刀を持たずに近づいたとき
      id: 'shadowNoWeapon',
      area: { minX: 2.6, maxX: 6, minZ: -1.4, maxZ: 1.4 },
      when: { all: [{ noItem: 'shinai' }, { notFlag: 'shadow1Awake' }] },
      actions: [
        { look: 'shadow1' },
        { meter: 0.7 },
        { say: ['……階段の前に、黒い影がうずくまっている。', '近づこうとすると、足がすくんで動かない。', '素手では無理だ。何か、身を守れる物を探そう。'] },
        { note: 'n_shadowSeen' },
      ],
    },
    {
      // 竹刀を持って近づいたとき：遭遇イベント
      id: 'shadowEncounter',
      area: { minX: 2.6, maxX: 7, minZ: -1.4, maxZ: 1.4 },
      when: { all: [{ item: 'shinai' }, { notFlag: 'shadow1Awake' }] },
      actions: [{ run: 'firstEncounter' }],
    },
  ],
  enemies: [{ id: 'shadow1', kind: 'shadow', hp: 4, activeWhen: { flag: 'shadow1Awake' }, onDefeat: [{ run: 'shadow1Defeated' }] }],
};

/** 操作説明 */
export const tutorials: StageDef['tutorials'] = {
  combat: {
    title: '戦闘の操作',
    touch: [
      '画面右下の<b>「攻撃」</b>ボタンで、竹刀を振る',
      '<b>「回避」</b>ボタンで、すばやく身をかわす（左のスティックを倒した方向へ。倒していなければ後ろへ）',
    ],
    pc: ['<b>F キー</b>（またはクリック）で、竹刀を振る', '<b>Shift キー</b>で、すばやく身をかわす（WASD で向きを決める。押していなければ後ろへ）'],
    common: [
      '竹刀が当たるのは、正面の、竹刀一本ぶんの距離まで',
      '敵の頭に<b>「！」</b>が出たら、攻撃してくる合図',
      '回避した直後は、少しのあいだ攻撃を受けない',
      '攻撃を受けると体力が減る。0 になると気絶する',
    ],
  },
};

/** 戦闘中に一度だけ出すヒント */
export const combatHints: StageDef['combatHints'] = {
  windup: '「！」── 回避',
  hurt: '「！」が出たら回避',
  hit: '当たった！',
  stun: '動けない ── 今だ！',
  charge: '突進 ── 横へ回避',
};
