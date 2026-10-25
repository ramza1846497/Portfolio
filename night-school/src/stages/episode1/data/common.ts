import type { StageDef, StagePart } from '../../../game/types';
import { OZ } from '../floor1';

/**
 * 怪異に属さない部分：導入・脱出・七不思議の掲示板・職員室の手がかり・雰囲気づくりの物。
 *
 * 一夜の流れ
 *   2 階で目覚める → 十三階段で 1 階へ → 職員室で心臓を見つけ、人体模型に返す（音楽室の鍵）
 *   → 2 階の音楽室でピアノの続きを弾く（女子トイレの鍵）→ 花子さんを呼ぶ（昇降口の鍵）
 *   → 1 階の昇降口から脱出
 *
 * 寄り道：職員室の引き出し（0214）→ 保健室で眠る子（nurse.ts）を起こさずに離れると、真のエンディング「目覚め」
 */
export const common: StagePart = {
  notes: [
    {
      id: 'n_seven',
      title: '学校の七不思議',
      body: '掲示板の古い貼り紙。\n一、トイレの花子さん　二、動く人体模型\n三、音楽室のピアノ　四、十三階段\n五つ目から先は、かすれて読めない。',
    },
    {
      id: 'n_seven5',
      title: '七不思議の五つ目',
      body: '保健室を出たあと、掲示板の五つ目が読めるようになっていた。\n「五、保健室で眠る子」',
    },
    {
      id: 'n_exit',
      title: '閉ざされた昇降口',
      body: '一階の昇降口は鎖と南京錠で閉ざされている。\n鍵がなければ外には出られない。',
    },
    {
      id: 'n_keybox',
      title: '鍵の保管箱',
      body: '職員室の鍵の保管箱。\n「音楽室」「女子便所」「昇降口」の鍵だけが、なくなっている。',
    },
    {
      id: 'n_journal',
      title: '宿直日誌',
      body: '「人体模型の心臓が、また外れて落とし物箱に入っていた。夜、あれに背を向けないこと」\n「音楽室のピアノが夜中に鳴る。曲は決まって『かえるのうた』で、途中で止まる。最後まで弾いてやれば静かになる、と用務員さんは言う」\n「東階段は老朽化のため使用禁止。机で塞いでおいた」\n「保健室の鍵は、保健の先生の机の引き出しへ。番号は、あの子が来なくなった日」',
    },
    {
      id: 'n_roll',
      title: '2-Bの出席簿',
      body: '最後の欄に、名字のない「花子」という名前。\n二月十四日から、欠席の印が何十年分も続いている。',
    },
  ],
  interactables: [
    {
      id: 'exit',
      name: '昇降口の扉',
      reactions: [
        {
          when: { all: [{ item: 'exitKey' }, { flag: 'truthSeen' }] },
          actions: [
            { sfx: 'unlock' },
            { say: ['鍵を差し込むと、重たい音を立てて回った。', '扉を開けると、まぶしい光が差し込んできた——'] },
            { fx: 'fadeOut', duration: 2 },
            { say: ['……', '気がつくと、白い天井が見えた。', '保健室のベッドの上だった。窓の外は、もう朝だ。', '枕元に、古い鍵が一本、転がっていた。'] },
            { clear: true, title: '目覚め', text: '保健室で眠っていたのは、あなた自身だった。<br>七不思議の残り二つは、まだ読めない。' },
          ],
        },
        {
          when: { item: 'exitKey' },
          actions: [
            { sfx: 'unlock' },
            { say: ['鍵を差し込むと、重たい音を立てて回った。', '鎖が床に落ちる。'] },
            { sfx: 'creak' },
            { say: [{ text: '……またね', style: 'whisper' }] },
            { fx: 'fadeOut', duration: 2 },
            {
              clear: true,
              title: '脱出成功',
              text: '花子さんは、今夜も三番目の個室で待っている。<br>……保健室の寝息は、誰のものだったのだろう。',
            },
          ],
        },
        { when: { note: 'n_exit' }, actions: [{ sfx: 'locked' }, { say: ['やはり開かない。鍵を探さないと。'] }] },
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
      id: 'barricadeEast',
      name: '積まれた机',
      reactions: [
        {
          when: { note: 'n_journal' },
          actions: [{ say: ['老朽化で使用禁止になった東階段。机で塞いだのは、宿直の先生だ。', '下へ降りるなら、西階段しかない。'] }],
        },
        {
          actions: [
            { say: ['東階段は、机が天井近くまで積み上げられていて通れない。', '机に貼り紙がある。「東階段　使用禁止」', '……下へ降りるなら、西階段しかない。'] },
          ],
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
        {
          when: { all: [{ flag: 'truthSeen' }, { notFlag: 'fifthRead' }] },
          actions: [
            { flag: 'fifthRead' },
            { say: ['……七不思議の貼り紙。', 'かすれていた五つ目が、読めるようになっている。', '「五、保健室で眠る子」', '六つ目と七つ目は、まだ読めない。'] },
            { note: 'n_seven5' },
          ],
        },
        { when: { note: 'n_seven' }, actions: [{ say: ['七不思議の貼り紙。花子さん、人体模型、音楽室のピアノ、十三階段……', '五つ目から先は、かすれている。'] }] },
        {
          actions: [
            {
              say: [
                '掲示板に、古い貼り紙がある。',
                '「学校の七不思議」……',
                '一、トイレの花子さん。二、動く人体模型。',
                '三、音楽室のピアノ。四、十三階段。',
                '五つ目から先は、かすれて読めない。',
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
      reactions: [
        {
          when: { note: 'n_roll' },
          actions: [{ say: ['「２月１４日（金）」「自習」。', '消された日直の名前に、目をこらす。', '……うっすらと「花子」と読める。この日から、ずっと自習のままなのだ。'] }],
        },
        { actions: [{ say: ['「２月１４日（金）」と「自習」の文字。', '日直の名前のところだけ、きれいに消されている。'] }] },
      ],
    },
    {
      id: 'podium2b',
      name: '2-Bの教卓',
      reactions: [
        { when: { note: 'n_roll' }, actions: [{ say: ['出席簿が入っている。もう見たくない。'] }] },
        {
          actions: [
            { say: ['引き出しに出席簿が入っている。', '最後の欄に……名字のない「花子」という名前。', '二月十四日から、欠席の印が、ずっと、ずっと続いている。'] },
            { fx: 'flashFlicker', duration: 0.5 },
            { note: 'n_roll' },
          ],
        },
      ],
    },
    {
      id: 'journal',
      name: '宿直日誌',
      reactions: [
        {
          actions: [
            { sfx: 'page' },
            {
              say: [
                '宿直の先生の日誌だ。',
                '「人体模型の心臓が、また外れて落とし物箱に入っていた。夜、あれに背を向けないこと」',
                '「音楽室のピアノが夜中に鳴る。曲は決まって『かえるのうた』で、途中で止まる」',
                '「最後まで弾いてやれば静かになる、と用務員さんは言う」',
                '「東階段は老朽化のため使用禁止。机で塞いでおいた」',
                '「保健室の鍵は、保健の先生の机の引き出しへ。番号は、あの子が来なくなった日」',
              ],
            },
            { note: 'n_journal' },
          ],
        },
      ],
    },
    {
      id: 'keybox',
      name: '鍵の保管箱',
      reactions: [
        {
          actions: [
            { say: ['鍵の保管箱。', '「音楽室」「女子便所」「昇降口」……この三つだけ、鍵がない。'] },
            { note: 'n_keybox' },
          ],
        },
      ],
    },
    {
      id: 'shoes',
      name: '下駄箱',
      reactions: [
        {
          when: { flag: 'hanakoAnswered' },
          actions: [{ say: ['赤い名札の上履きが、なくなっている。', '名札が入っていた棚に、小さく「はなこ」と書かれていた。'] }],
        },
        { actions: [{ say: ['上履きがところどころに残っている。', 'ひとつだけ、赤い名札の上履きが、ずっとこちらを向いている。名前はかすれて読めない。'] }] },
      ],
    },
  ],
  scripts: {
    intro: [
      { fx: 'fadeIn', duration: 2.5 },
      {
        say: [
          '……ここは。',
          '学校の、二階の廊下だ。',
          'いつの間に眠っていたんだろう。窓の外は、もう真っ暗だ。',
          '早く帰らないと。昇降口は一階だ。',
        ],
      },
      { say: [{ text: '目的：一階の昇降口から脱出する', style: 'system' }] },
    ],
  },
  triggers: [
    {
      id: 'arrive1f',
      area: { minX: 0, maxX: 6, minZ: OZ - 1.5, maxZ: OZ + 1.5 },
      when: { flag: 'stairsSolved' },
      actions: [{ say: ['一階の廊下も、しんと静まり返っている。', '昇降口は、東の突き当たりの方だ。'] }],
    },
    {
      id: 'hallEnter',
      area: { minX: 32.4, maxX: 43.6, minZ: OZ + 1.6, maxZ: OZ + 9.8 },
      actions: [{ say: ['昇降口だ。ガラス扉の向こうは、霧で何も見えない。'] }],
    },
  ],
};

/** 画面左上の目的。上から順に、最初に当てはまるものを出す */
export const objectives: StageDef['objectives'] = [
  { when: { item: 'exitKey' }, text: '一階の昇降口から脱出する' },
  { when: { flag: 'keyAppeared' }, text: '三番目の個室を調べる' },
  { when: { flag: 'toiletOpen' }, text: '女子トイレで花子さんを呼び出す' },
  { when: { item: 'toiletKey' }, text: '二階の女子トイレの鍵を開ける' },
  { when: { flag: 'toiletKeyAppeared' }, text: 'ピアノの上の鍵を取る' },
  { when: { flag: 'musicOpen' }, text: '音楽室のピアノを調べる' },
  { when: { item: 'musicKey' }, text: '二階の音楽室を開ける' },
  { when: { item: 'heart' }, text: '人体模型に心臓を返す（目を離すな）' },
  { when: { flag: 'modelSeen' }, text: '人体模型の心臓を探す' },
  { when: { flag: 'stairsSolved' }, text: '一階を調べる' },
  { text: '一階へ降りる方法を探す' },
];
