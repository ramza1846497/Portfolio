import type { StagePart } from '../../../game/types';
import { OZ } from '../floor1';

/**
 * 1 階の南：渡り廊下・中庭・体育館。戦闘の山場。
 *
 * 渡り廊下に入ると、中庭の影たちが動き出す（ザコ戦）。
 * 体育館の扉は「体育館の鍵」（人体模型が握っていた）で開く。
 * 中に入ると、台座から消えた二宮金次郎像が待っている（中ボス）。倒すと薪の中から音楽室の鍵が出る。
 *
 * flag wingEntered  渡り廊下に入った（影が動き出す）
 * flag gymOpen      体育館の扉を開けた
 * flag bossAwake    像が動き出した
 * flag bossDead     像を倒した
 */
export const wing: StagePart = {
  items: [
    { id: 'gymKey', name: '体育館の鍵' },
    { id: 'musicKey', name: '音楽室の鍵' },
  ],
  notes: [
    {
      id: 'n_rumor',
      title: '学校のうわさ',
      body: '渡り廊下の貼り紙。\n「二宮金次郎の像は、夜になると台座をおりて、校内を走りまわる」',
    },
    {
      id: 'n_pedestal',
      title: '空っぽの台座',
      body: '中庭の台座には「勤勉」の文字だけ。像がいない。\n石の足跡が、体育館の方へ続いている。',
    },
    {
      id: 'n_gymLocked',
      title: '体育館の扉',
      body: '体育館の扉は施錠されている。\n扉の向こうから、ずしん、ずしんと重い足音がする。',
    },
    {
      id: 'n_ninomiya',
      title: '走る二宮金次郎像',
      body: '薪を背負い、本を抱えた石像。人の倍はありそうな重さで突進してくる。\n壁に激突すると、しばらく動けなくなる。そこが狙い目だ。',
    },
    {
      id: 'n_musicKeyBoss',
      title: '音楽室の鍵',
      body: '崩れた二宮金次郎像の、背中の薪の中に挟まっていた。',
    },
  ],
  interactables: [
    {
      id: 'rumorNotice',
      name: '貼り紙',
      reactions: [{ actions: [{ say: ['「学校のうわさ」', '二宮金次郎の像は、夜になると台座をおりて、校内を走りまわる。'] }, { note: 'n_rumor' }] }],
    },
    {
      id: 'pedestal',
      name: '台座',
      reactions: [
        {
          actions: [
            { say: ['二宮金次郎像の台座だ。「勤勉」と彫ってある。', '……像が、いない。', '台座から、石の足跡が点々と、体育館の方へ続いている。'] },
            { note: 'n_pedestal' },
          ],
        },
      ],
    },
    {
      id: 'gymDoor',
      name: '体育館の扉',
      reactions: [
        { when: { flag: 'gymOpen' }, actions: [{ say: ['体育館の扉は開いている。'] }] },
        {
          when: { item: 'gymKey' },
          actions: [{ sfx: 'unlock' }, { take: 'gymKey' }, { flag: 'gymOpen' }, { open: 'gymDoor' }, { sfx: 'creak' }, { say: ['重い引き戸が、ゆっくりと開いた。', '……中は広くて、暗い。'] }],
        },
        {
          actions: [{ sfx: 'locked' }, { say: ['鍵がかかっている。', '……扉の向こうで、ずしん、と重い足音がした。'] }, { note: 'n_gymLocked' }],
        },
      ],
    },
  ],
  scripts: {
    bossIntro: [
      { look: 'ninomiya' },
      { sfx: 'stomp' },
      { meter: 1 },
      { say: ['舞台の前に、二宮金次郎の像が立っている。', '……ぎぎ、と石の首がこちらを向いた。'] },
      { movie: 'ninomiya' },
      { say: ['……大きい。でも、まっすぐにしか走れないなら——'] },
      { flag: 'bossAwake' },
    ],
    bossHalf: [
      { meter: 1 },
      { fx: 'strobe', duration: 1.2, target: 'gym' },
      { movie: 'ninomiyaRage' },
    ],
    bossDefeated: [
      { flag: 'bossDead' },
      { sfx: 'fall' },
      { fx: 'shake' },
      { say: ['石像に、大きなひびが走った。', '……がらがらと音を立てて、像は崩れ落ちた。'] },
      { wait: 600 },
      { say: ['崩れた薪の中に、何か光る物が挟まっている。', '鍵だ。札に「音楽室」とある。'] },
      { sfx: 'pickup' },
      { give: 'musicKey' },
      { note: 'n_musicKeyBoss' },
      { heal: 30 },
      { say: ['……息が、少し落ち着いてきた。'] },
    ],
  },
  triggers: [
    {
      id: 'wingEnter',
      area: { minX: 22.4, maxX: 24.4, minZ: OZ + 1.6, maxZ: OZ + 6 },
      actions: [
        { flag: 'wingEntered' },
        { say: ['渡り廊下だ。外の空気が、ひやりと冷たい。'] },
        { look: 'shadow2' },
        { meter: 0.8 },
        { say: ['……廊下の先にも、中庭の暗がりにも、黒い影がうごめいている。', '一つや二つじゃない。'] },
      ],
    },
    {
      id: 'gymEnter',
      area: { minX: 9, maxX: 35, minZ: OZ + 21.6, maxZ: OZ + 36 },
      when: { all: [{ notFlag: 'bossAwake' }, { notFlag: 'bossDead' }] },
      actions: [{ run: 'bossIntro' }],
    },
  ],
  enemies: [
    { id: 'shadow2', kind: 'shadow', hp: 4, activeWhen: { flag: 'wingEntered' }, onDefeat: [] },
    { id: 'shadow3', kind: 'shadow', hp: 4, activeWhen: { flag: 'wingEntered' }, onDefeat: [] },
    { id: 'shadow4', kind: 'shadow', hp: 4, activeWhen: { flag: 'wingEntered' }, onDefeat: [] },
    {
      id: 'ninomiya',
      kind: 'ninomiya',
      hp: 14,
      bossName: '走る二宮金次郎像',
      activeWhen: { flag: 'bossAwake' },
      onHalf: [{ run: 'bossHalf' }],
      onDefeat: [{ run: 'bossDefeated' }],
    },
  ],
  presences: [{ id: 'gymPresence', x: 23, z: OZ + 30, radius: 10, strength: 0.5, when: { notFlag: 'bossDead' } }],
};
