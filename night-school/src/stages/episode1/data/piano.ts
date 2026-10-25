import type { StagePart } from '../../../game/types';

/**
 * 怪異その三「音楽室のピアノ」（2 階・音楽室）。
 *
 * 決まり：夜のピアノは「かえるのうた」を途中まで弾いて止まる。
 *         続き（ミ ファ ソ ラ ソ ファ ミ）を弾いてあげると静かになる。
 *         間違えると蓋が叩きつけられる。
 *
 * flag musicOpen          音楽室の扉を開けた
 * flag pianistShow        ピアノの前に半透明の子どもが立っている
 * flag pianoSolved        最後まで弾いた
 * flag toiletKeyAppeared  ピアノの上に女子トイレの鍵が出ている
 */
const FIRST_HALF = 'ド レ ミ ファ ミ レ ド';
const SECOND_HALF = ['ミ', 'ファ', 'ソ', 'ラ', 'ソ', 'ファ', 'ミ'];

export const piano: StagePart = {
  notes: [
    {
      id: 'n_musicLocked',
      title: '音楽室',
      body: '二階の音楽室は施錠されている。\n扉の向こうから、かすかにピアノの音がした気がする。',
    },
    {
      id: 'n_song',
      title: '今月の歌',
      body: '音楽室の黒板。「かえるのうた」\nド レ ミ ファ ミ レ ド ／ ミ ファ ソ ラ ソ ファ ミ',
    },
    {
      id: 'n_pianoWrong',
      title: 'ピアノの蓋',
      body: '違う音を弾くと、鍵盤の蓋が叩きつけられた。\n「……ちがう」と、子どもの声がした。',
    },
    {
      id: 'n_piano',
      title: 'ピアノの決まり',
      body: '途中で止まった曲を、最後まで弾いてあげると……\n拍手が聞こえ、ピアノの子はいなくなった。',
    },
    {
      id: 'n_toiletKey',
      title: '女子トイレの鍵',
      body: 'ピアノの上に置かれていた南京錠の鍵。札に「女子便所」とある。',
    },
  ],
  items: [{ id: 'toiletKey', name: '女子トイレの鍵' }],
  interactables: [
    {
      id: 'musicDoor',
      name: '音楽室の扉',
      reactions: [
        { when: { flag: 'musicOpen' }, actions: [{ say: ['音楽室の扉。開いている。'] }] },
        {
          when: { item: 'musicKey' },
          actions: [
            { sfx: 'unlock' },
            { take: 'musicKey' },
            { flag: 'musicOpen' },
            { open: 'musicDoor' },
            { sfx: 'creak' },
            { say: ['鍵が回った。', '引き戸が、ガラガラと重たい音を立てて開く。'] },
          ],
        },
        {
          actions: [
            { sfx: 'locked' },
            { say: ['鍵がかかっている。', '……扉の向こうで、ポーン、とピアノが一音だけ鳴った。'] },
            { note: 'n_musicLocked' },
          ],
        },
      ],
    },
    {
      id: 'piano',
      name: 'ピアノ',
      reactions: [
        { when: { flag: 'pianoSolved' }, actions: [{ say: ['ピアノは静かだ。', '鍵盤の上に、細い指の跡だけが残っている。'] }] },
        {
          actions: [
            { say: ['鍵盤の蓋が開いたままだ。', '「かえるのうた」が、途中で止まっている。……続きを、弾いてほしいのだろうか。'] },
            {
              sequence: {
                prompt: '続きを弾く（7音）',
                keys: ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'],
                answer: SECOND_HALF,
                sound: 'piano',
                correct: [{ run: 'pianoRight' }],
                wrong: [{ run: 'pianoWrong' }],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'blackboardMusic',
      name: '音楽室の黒板',
      reactions: [
        {
          actions: [
            { say: ['今月の歌「かえるのうた」。', 'ド レ ミ ファ ミ レ ド', 'ミ ファ ソ ラ ソ ファ ミ'] },
            { note: 'n_song' },
          ],
        },
      ],
    },
    {
      id: 'portraits',
      name: '音楽家の肖像画',
      reactions: [
        { when: { flag: 'pianoSolved' }, actions: [{ say: ['肖像画たちは、満足そうに見える……気のせいだろう。'] }] },
        { actions: [{ say: ['バッハ、モーツァルト、ベートーヴェン、ショパン。', 'どの目も、ピアノの方を見ている。'] }] },
      ],
    },
    {
      id: 'toiletKeyObj',
      name: '小さな鍵',
      visibleWhen: { flag: 'toiletKeyAppeared' },
      reactions: [
        {
          actions: [
            { sfx: 'pickup' },
            { flag: 'toiletKeyAppeared', value: false },
            { give: 'toiletKey' },
            { note: 'n_toiletKey' },
            { say: ['南京錠の鍵だ。札に「女子便所」と書いてある。'] },
          ],
        },
      ],
    },
  ],
  scripts: {
    pianoRight: [
      { wait: 400 },
      { say: [{ text: '……ありがとう', style: 'ghost' }] },
      { melody: `${FIRST_HALF} - ${SECOND_HALF.join(' ')} -`, tempo: 150 },
      { sfx: 'clap' },
      { say: ['パチ、パチ、パチ……', 'どこからか、まばらな拍手が聞こえた。'] },
      { fx: 'flashFlicker', duration: 0.5 },
      { flag: 'pianistShow', value: false },
      { flag: 'pianoSolved' },
      { flag: 'toiletKeyAppeared' },
      { note: 'n_piano' },
      { say: ['……ピアノの前の子が、いなくなっている。', 'ピアノの上に、小さな鍵が置かれていた。'] },
    ],
    pianoWrong: [
      { sfx: 'slam' },
      { fx: 'strobe', duration: 1 },
      { fx: 'shake' },
      { say: [{ text: '……ちがう', style: 'ghost' }] },
      { addVar: 'pianoFail', value: 1 },
      {
        if: { var: 'pianoFail', eq: 1 },
        then: [{ say: ['鍵盤の蓋が、指をかすめて叩きつけられた。', '……もう一度、最初から弾いてみよう。'] }, { note: 'n_pianoWrong' }],
        else: [{ say: ['また違ったらしい。'] }],
      },
      { melody: FIRST_HALF, tempo: 132 },
    ],
  },
  triggers: [
    {
      id: 'musicEnter',
      area: { minX: 1.2, maxX: 13.8, minZ: -9.3, maxZ: -1.7 },
      when: { all: [{ flag: 'musicOpen' }, { notFlag: 'pianoSolved' }] },
      actions: [
        { flag: 'pianistShow' },
        { look: 'piano' },
        { melody: FIRST_HALF, tempo: 132 },
        { say: ['……ピアノが、ひとりでに鳴っている。', 'ピアノの前に、誰かが立っている。……透けている。', '曲は途中で、ぷつりと止まった。'] },
      ],
    },
    {
      // ピアノの後、廊下に出ると女子トイレの前に少女が立っている
      id: 'glimpse',
      area: { minX: 10.8, maxX: 13.6, minZ: -1.4, maxZ: 0.6 },
      when: { all: [{ flag: 'pianoSolved' }, { notFlag: 'toiletOpen' }] },
      actions: [
        { flag: 'glimpse' },
        { sfx: 'laugh' },
        { look: 'hanakoGlimpse' },
        { say: ['……！', '女子トイレの前に、赤いスカートの女の子が立っている。'] },
        { fx: 'flashFlicker', duration: 0.6 },
        { wait: 400 },
        { flag: 'glimpse', value: false },
        { say: ['……消えた。', 'まるで、こっちへおいでと言うように。'] },
      ],
    },
  ],
  visibility: [
    { id: 'pianist', when: { flag: 'pianistShow' } },
    { id: 'hanakoGlimpse', when: { flag: 'glimpse' } },
  ],
};
