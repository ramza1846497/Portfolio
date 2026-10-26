import type { StagePart } from '../../../game/types';

/**
 * 怪異その四「十三階段」（西階段）。
 *
 * 決まり：夜の西階段は十三段になる。十三段目を踏むと、上の階へ戻される。
 *         十三段目はまたいで降りる。一度うまく降りれば、以後は普通に行き来できる。
 *
 * flag stairsSolved  十三段目をまたいで降りた
 * var  stairsFail    十三段目を踏んだ回数
 */
export const stairs: StagePart = {
  presences: [{ id: 'thirteen', x: -1.6, z: 0, radius: 5, strength: 0.55, when: { notFlag: 'stairsSolved' } }],
  notes: [
    {
      id: 'n_graffiti',
      title: '西階段の落書き',
      body: '階段の前の壁に、赤い字のなぐり書き。\n「十三段目は　ふむな」',
    },
    {
      id: 'n_stairsWrong',
      title: '十三段目',
      body: '西階段は、本当は十二段のはずだ。\n夜だけ現れる十三段目を踏むと、また二階の上に戻されていた。',
    },
    {
      id: 'n_stairs',
      title: '十三階段の決まり',
      body: '十三段目をまたいで降りると、一階に着いた。\n一度降りてしまえば、もう段は増えないようだ。',
    },
  ],
  interactables: [
    {
      id: 'graffiti',
      name: '壁の落書き',
      reactions: [
        {
          actions: [
            { say: ['赤い塗料で、なぐり書きがしてある。', '「十三段目は　ふむな」', '……この階段は、十二段しかなかったはずだ。'] },
            { note: 'n_graffiti' },
          ],
        },
      ],
    },
    {
      id: 'stairs2f',
      name: '西階段（下り）',
      reactions: [
        { when: { flag: 'stairsSolved' }, actions: [{ run: 'goDown' }] },
        {
          actions: [
            {
              choice: {
                prompt: '一階へ続く階段。下は真っ暗だ。',
                options: [
                  { label: '降りる', actions: [{ run: 'stairsRitual' }] },
                  { label: 'やめる', actions: [] },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'stairs1f',
      name: '西階段（上り）',
      reactions: [{ actions: [{ run: 'goUp' }] }],
    },
  ],
  scripts: {
    stairsRitual: [
      { sfx: 'step' },
      { say: ['一段、二段、三段……', '……九段、十段、十一段。', '十二段。……踊り場のはずだ。'] },
      { sfx: 'whisper' },
      { meter: 0.9 },
      { fx: 'flashFlicker', duration: 0.8 },
      { say: ['……足の下に、まだ段がある。', '十三段目が。'] },
      {
        choice: {
          prompt: '十三段目……',
          options: [
            { label: 'そのまま踏む', actions: [{ run: 'stairsWrong' }] },
            { label: 'またいで飛び降りる', actions: [{ run: 'stairsRight' }] },
          ],
        },
      },
    ],
    stairsWrong: [
      { sfx: 'stinger' },
      { fx: 'strobe', duration: 1.2 },
      { say: ['足を乗せた瞬間、段がぐにゃりと沈んだ——'] },
      { damage: 10 },
      { fx: 'fadeOut', duration: 0.8 },
      { teleport: 'f2Stairs' },
      { wait: 600 },
      { fx: 'fadeIn', duration: 1.2 },
      { addVar: 'stairsFail', value: 1 },
      {
        if: { var: 'stairsFail', eq: 1 },
        then: [{ say: ['……気がつくと、階段の上に立っていた。', 'まだ、二階だ。'] }, { note: 'n_stairsWrong' }],
        else: [{ say: ['……また、二階に戻された。'] }],
      },
    ],
    stairsRight: [
      { sfx: 'thud' },
      { fx: 'fadeOut', duration: 0.8 },
      { flag: 'stairsSolved' },
      { teleport: 'f1Stairs' },
      { wait: 500 },
      { fx: 'fadeIn', duration: 1.2 },
      { say: ['……着地した。', '振り返ると、階段は十二段しかない。', '一階に着いた。'] },
      { note: 'n_stairs' },
    ],
    goDown: [
      { sfx: 'step' },
      { fx: 'fadeOut', duration: 0.5 },
      { teleport: 'f1Stairs' },
      { fx: 'fadeIn', duration: 0.6 },
    ],
    goUp: [
      { sfx: 'step' },
      { fx: 'fadeOut', duration: 0.5 },
      { teleport: 'f2Stairs' },
      { fx: 'fadeIn', duration: 0.6 },
    ],
  },
};
