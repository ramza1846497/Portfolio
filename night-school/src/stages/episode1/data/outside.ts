import type { Action, InteractableDef, StagePart } from '../../../game/types';
import { STORE, ZO } from '../outside';

/**
 * 学校を出たあと：霧の夜道と、コンビニ「ヨミマート」。
 *
 * 校門の外には細い道と民家が並んでいるはずが、何もない。しばらく歩くとコンビニの明かりが点く。
 *
 * 怪異その六「真夜中のコンビニ」
 * 決まり：お会計が済むまで帰れない。店員（のっぺらぼう）の顔を見てはいけない。
 *         近くで顔が画面に映っている間、体力がじわじわ減る（../clerk.ts）。
 *         レジは店員から離れた東の端にあるので、レジの前で正面を向けば顔は視界の外。
 * お代が足りないまま入ってしまったら、店員がドアを開けて取りに行かせてくれる（詰まないように）。
 * 買う物：駐車場に落ちている「おつかいメモ」の三つ（菊の花・線香・まんじゅう）。それ以外を入れると叱られる。
 * お代  ：道に落ちている十円玉を三枚。
 *
 * flag outside     校舎を出た
 * flag storeLit    コンビニの明かりが点いた
 * flag inStore     店に入った（自動ドアが閉まって出られない）
 * flag storePaid   会計を済ませた
 * flag buy_<品>    カゴに入れた
 * var  coins       拾った十円玉の数
 */
const OFFERINGS = ['kiku', 'senko', 'manju'];
const OTHERS = ['onigiri', 'candy', 'milk'];

/** 売り物：カゴに入れる／戻す */
function goods(id: string, name: string, desc: string): InteractableDef {
  const flag = `buy_${id}`;
  return {
    id,
    name,
    visibleWhen: { notFlag: 'storePaid' },
    reactions: [
      {
        when: { flag },
        actions: [
          {
            choice: {
              prompt: `${name}はカゴに入っている。`,
              options: [
                { label: '棚に戻す', actions: [{ flag, value: false }, { say: [`${name}を棚に戻した。`] }] },
                { label: 'そのままにする', actions: [] },
              ],
            },
          },
        ],
      },
      {
        actions: [
          {
            choice: {
              prompt: desc,
              options: [
                { label: 'カゴに入れる', actions: [{ sfx: 'click' }, { flag }, { say: [`${name}をカゴに入れた。`] }] },
                { label: 'やめる', actions: [] },
              ],
            },
          },
        ],
      },
    ],
  };
}

function coin(n: number): InteractableDef {
  return {
    id: `coin${n}`,
    name: '十円玉',
    visibleWhen: { notFlag: `coin${n}Taken` },
    reactions: [
      {
        actions: [
          { sfx: 'pickup' },
          { flag: `coin${n}Taken` },
          { addVar: 'coins', value: 1 },
          { say: ['古い十円玉だ。ずいぶん昔の年号が刻まれている。（{coins}枚目）'] },
          ...(n === 1 ? [{ note: 'n_coins' } as Action] : []),
        ],
      },
    ],
  };
}

const allOfferings = { all: [...OFFERINGS.map((id) => ({ flag: `buy_${id}` })), ...OTHERS.map((id) => ({ notFlag: `buy_${id}` }))] };
const anyInBasket = { any: [...OFFERINGS, ...OTHERS].map((id) => ({ flag: `buy_${id}` })) };
const emptyBasket: Action[] = [...OFFERINGS, ...OTHERS].map((id) => ({ flag: `buy_${id}`, value: false }));

export const outside: StagePart = {
  items: [
    { id: 'kiku', name: '菊の花' },
    { id: 'senko', name: '線香' },
    { id: 'manju', name: 'まんじゅう' },
  ],
  notes: [
    {
      id: 'n_outside',
      title: '校門の外',
      body: '校門の外には、細い道と家々が並んでいるはずだった。\n何もない。霧の中に、一本道だけが続いている。',
    },
    {
      id: 'n_coins',
      title: '道に落ちた十円玉',
      body: '夜道に、古い十円玉が点々と落ちている。\nまるで、誰かが道しるべに置いたように。',
    },
    {
      id: 'n_shoplist',
      title: 'おつかいメモ',
      body: '駐車場に落ちていた、子どもの字のメモ。\n「おつかい　きくのはな　おせんこう　おまんじゅう　　はなこ」',
    },
    {
      id: 'n_storeRule',
      title: '深夜のお客様へ',
      body: '一、お会計がお済みでないお客様は、お帰りになれません。\n二、店員の顔は、見ないでください。',
    },
    {
      id: 'n_noppera',
      title: '店員の顔',
      body: '店員の顔には、目も鼻も口もない。\n近くで顔が目に入っている間、体の力が抜けていく。視界に入れないようにしよう。',
    },
    {
      id: 'n_newspaper',
      title: '古い新聞',
      body: '「二月十五日　夕刊　女子児童、校内で行方不明」\n日付は、何十年も前のものだった。',
    },
    {
      id: 'n_receipt',
      title: 'レシート',
      body: 'きくのはな・おせんこう・おまんじゅう　合計三十円\n裏に、子どもの字で「ありがとう　またあそぼうね」\n……そして、小さく「六、真夜中のコンビニ」。',
    },
  ],
  interactables: [
    {
      id: 'gate',
      name: '校門',
      reactions: [{ actions: [{ say: ['校門は閉まっている。', '……今さら、戻る気にはなれない。'] }] }],
    },
    coin(1),
    coin(2),
    coin(3),
    {
      id: 'shoplist',
      name: 'メモ',
      reactions: [
        {
          actions: [
            { sfx: 'page' },
            { say: ['子どもの字で書かれたメモだ。', '「おつかい　きくのはな　おせんこう　おまんじゅう」', '……最後に「はなこ」と書いてある。'] },
            { note: 'n_shoplist' },
          ],
        },
      ],
    },
    {
      id: 'storeDoor',
      name: '自動ドア',
      reactions: [
        { when: { flag: 'storePaid' }, actions: [{ say: ['自動ドアは開いている。'] }] },
        {
          when: { all: [{ flag: 'inStore' }, { var: 'coins', lt: 3 }] },
          actions: [
            { sfx: 'locked' },
            { say: ['自動ドアが開かない。'] },
            { say: [{ speaker: '店員', text: '……お代を、取りに行かれますか', style: 'ghost' }] },
            {
              choice: {
                options: [
                  { label: '取りに行く', actions: [{ run: 'storeLetOut' }] },
                  { label: 'やめる', actions: [] },
                ],
              },
            },
          ],
        },
        {
          when: { flag: 'inStore' },
          actions: [{ sfx: 'locked' }, { say: ['自動ドアが開かない。', 'ガラスを叩いても、外の霧が揺れるだけだ。'] }],
        },
        { actions: [{ say: ['コンビニの自動ドアだ。'] }] },
      ],
    },
    {
      id: 'storeRule',
      name: '貼り紙',
      reactions: [
        {
          actions: [
            { say: ['入口のガラスに、内側から貼り紙がしてある。', '「深夜のお客様へ」', '一、お会計がお済みでないお客様は、お帰りになれません。', '二、店員の顔は、見ないでください。'] },
            { note: 'n_storeRule' },
          ],
        },
      ],
    },
    {
      id: 'newspaper',
      name: '新聞',
      reactions: [
        {
          actions: [
            { say: ['ラックに新聞が一部だけ差してある。', '「二月十五日　夕刊」', '「女子児童、校内で行方不明」……', '日付は、何十年も前のものだ。'] },
            { note: 'n_newspaper' },
          ],
        },
      ],
    },
    goods('kiku', '菊の花', 'バケツに、白と黄色の菊の花が挿してある。'),
    goods('senko', '線香', '箱入りの線香。棚の奥に、ろうそくも並んでいる。'),
    goods('manju', 'まんじゅう', '白い紙に包まれたおまんじゅう。「お供え用」と書いてある。'),
    goods('onigiri', 'おにぎり', 'おにぎりが三つ並んでいる。……どれも、具の名前が書かれていない。'),
    goods('candy', '飴', '色とりどりの飴の袋。'),
    goods('milk', '牛乳', '冷蔵ケースの牛乳。賞味期限の欄が、空白だ。'),
    {
      id: 'register',
      name: 'レジ',
      reactions: [
        { when: { flag: 'storePaid' }, actions: [{ say: ['レジには、もう誰もいない。'] }] },
        {
          actions: [
            { say: [{ speaker: '店員', text: '……お決まりですか', style: 'ghost' }] },
            {
              if: { not: anyInBasket },
              then: [{ say: ['……まだ、何もカゴに入れていない。'] }],
              else: [
                {
                  if: allOfferings,
                  then: [
                    {
                      if: { var: 'coins', gte: 3 },
                      then: [{ run: 'storePay' }],
                      else: [
                        { say: [{ speaker: '店員', text: '……お代が、足りませんね', style: 'ghost' }, '持っている十円玉は {coins} 枚。……道に、落ちていなかったか。'] },
                        { say: [{ speaker: '店員', text: '……お持ちになるまで、お待ちしております', style: 'ghost' }] },
                        { run: 'storeLetOut' },
                      ],
                    },
                  ],
                  else: [{ run: 'storeWrong' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  scripts: {
    /** 昇降口の鍵で外へ出る */
    leaveSchool: [
      { sfx: 'unlock' },
      { say: ['鍵を差し込むと、重たい音を立てて回った。', '鎖が床に落ちる。'] },
      { sfx: 'creak' },
      { say: [{ text: '……またね', style: 'whisper' }] },
      { fx: 'fadeOut', duration: 2 },
      { take: 'exitKey' },
      { flag: 'outside' },
      { teleport: 'outsideStart' },
      { wait: 800 },
      { fx: 'fadeIn', duration: 2.5 },
      { say: ['……外だ。', '校門を出れば、細い道があって、家が並んでいるはずだった。', '……何もない。', '霧の中に、一本の道だけが続いている。', '……とにかく、家に帰らなきゃ。'] },
      { note: 'n_outside' },
    ],
    storeWrong: [
      { say: [{ speaker: '店員', text: '……それは、ちがいますよね', style: 'ghost' }] },
      { meter: 1 },
      { fx: 'strobe', duration: 1.4, target: 'store' },
      { sfx: 'stinger' },
      { damage: 10 },
      ...emptyBasket,
      { say: ['……カゴの中身が、いつの間にか空になっていた。'] },
    ],
    /** お代が足りないとき：一度だけ外へ出してくれる */
    storeLetOut: [
      { sfx: 'chime' },
      { open: 'storeDoorL' },
      { open: 'storeDoorR' },
      { say: ['……背後で、自動ドアが開いた。', '十円玉を探してこい、ということらしい。'] },
    ],
    storePay: [
      { sfx: 'click' },
      { setVar: 'coins', value: 0 },
      { say: ['十円玉を三枚、カウンターに置いた。', 'いつの間にか、レジの向こうに誰かが立っている気配がする。', '顔を上げないように、手元だけを見る。……白い、細い手が伸びてきた。'] },
      { say: [{ speaker: '店員', text: '……おそなえもの、ですね', style: 'ghost' }] },
      { sfx: 'click' },
      { wait: 300 },
      { sfx: 'pickup' },
      { say: [{ speaker: '店員', text: '……ありがとうございました', style: 'ghost' }] },
      { fx: 'strobe', duration: 1.2, target: 'store' },
      { meter: 0.8 },
      { flag: 'storePaid' },
      { give: 'kiku' },
      { give: 'senko' },
      { give: 'manju' },
      { wait: 900 },
      { say: ['……顔を上げると、レジには誰もいなかった。', 'カウンターに、レシートが一枚残っている。'] },
      { note: 'n_receipt' },
      { sfx: 'chime' },
      { open: 'storeDoorL' },
      { open: 'storeDoorR' },
      { say: ['……背後で、自動ドアが開いた。'] },
    ],
  },
  triggers: [
    {
      id: 'roadBehind',
      area: { minX: 12, maxX: 15, minZ: ZO - 2.5, maxZ: ZO + 2.5 },
      when: { flag: 'outside' },
      actions: [
        { sfx: 'step' },
        { wait: 450 },
        { sfx: 'step' },
        { meter: 0.6 },
        { say: ['……背後で、足音がした。'] },
        { say: ['振り返っても、霧しかない。校門ももう見えない。'] },
      ],
    },
    {
      // しばらく歩くと、前方に明かりが点く
      id: 'storeLights',
      area: { minX: 28, maxX: 32, minZ: ZO - 2.5, maxZ: ZO + 2.5 },
      when: { flag: 'outside' },
      actions: [
        { flag: 'storeLit' },
        { look: 'storeSign' },
        { sfx: 'chime' },
        { say: ['……前の方で、ぱっと明かりが点いた。', 'コンビニだ。こんなところに？', '……何もない道に、あそこだけが明るい。'] },
      ],
    },
    {
      id: 'storeApproach',
      area: { minX: 66, maxX: 69.9, minZ: ZO - 2, maxZ: ZO + 2 },
      when: { all: [{ flag: 'storeLit' }, { notFlag: 'inStore' }] },
      once: false,
      actions: [{ sfx: 'chime' }, { open: 'storeDoorL' }, { open: 'storeDoorR' }],
    },
    {
      id: 'storeEnter',
      area: { minX: 71.0, maxX: STORE.maxX, minZ: STORE.minZ, maxZ: STORE.maxZ },
      when: { all: [{ notFlag: 'inStore' }, { notFlag: 'storePaid' }] },
      once: false,
      actions: [
        { close: 'storeDoorL' },
        { close: 'storeDoorR' },
        { flag: 'inStore' },
        {
          if: { flag: 'storeVisited' },
          then: [{ say: [{ speaker: '店員', text: '……おかえりなさいませ', style: 'ghost' }, '……背後で、自動ドアが閉まった。'] }],
          else: [
            { flag: 'storeVisited' },
            { look: 'clerk' },
            { meter: 0.7 },
            { say: [{ speaker: '店員', text: '……いらっしゃいませ', style: 'ghost' }] },
            { say: ['カウンターの奥に、店員がひとり立っている。うつむいていて、顔は見えない。', '……背後で、自動ドアが閉まった。'] },
          ],
        },
      ],
    },
    {
      // お代を取りに外へ出た：また入るとドアが閉まる
      id: 'storeLeave',
      area: { minX: 60, maxX: 69.6, minZ: ZO - 7, maxZ: ZO + 7 },
      when: { all: [{ flag: 'inStore' }, { notFlag: 'storePaid' }] },
      once: false,
      actions: [{ flag: 'inStore', value: false }, { close: 'storeDoorL' }, { close: 'storeDoorR' }],
    },
    {
      id: 'storeExit',
      area: { minX: 60, maxX: 69.6, minZ: ZO - 7, maxZ: ZO + 7 },
      when: { flag: 'storePaid' },
      // 先の話は houses.ts
      actions: [{ run: 'toAlley' }],
    },
  ],
  visibility: [
    { id: 'storeSign', when: { flag: 'storeLit' } },
    { id: 'storeWindowN', when: { flag: 'storeLit' } },
    { id: 'storeWindowS', when: { flag: 'storeLit' } },
    { id: 'clerk', when: { notFlag: 'storePaid' } },
  ],
};
