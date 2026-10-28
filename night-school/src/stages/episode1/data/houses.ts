import type { Action, StagePart } from '../../../game/types';
import { ZH, ZM } from '../houses';

/**
 * コンビニの先：花子さんの家 → 自分の家。学校を出たあとの目的は「家に帰る」。
 *
 * 【花子さんの家】
 *   路地の先へ先へと現れる花子さんについていくと、表札の削られた古い家に着く。
 *   決まり：仏壇へのお供えは「お花 → お線香 → お菓子」の順（仏壇の引き出しの祖母のメモ）。
 *           線香には火が要る（台所の引き出しのマッチ）。順番を間違えると叱られて体力 -10。
 *   黒電話：居間に入ると鳴り、2 月 14 日の母親の声が聞こえる。供え終えると、もう一度鳴る（花子さんから）。
 *
 * 【自分の家】
 *   花子さんの電話の忠告と、下駄箱の上の「おうちのきまり」に従う。
 *     一、「ただいま」と言わない（言うと何人もの声が返事をする：体力 -25）
 *     二、「ごはんよ」と呼ばれても台所へ行かない（「母」が振り向く：体力 -25）
 *     三、自分の布団で寝ない（寝るとバッドエンド「おかえり」）
 *     四、電話が鳴ったら出る（家族写真・テレビ・きまりを見たあとに鳴る → 目が覚める）
 *   エンディング：保健室の寄り道をしていれば「目覚め」、していなければ「帰宅」。
 */

/** 仏壇に一つ供える。step は何番目に供えるべき物か（1 から） */
function offer(item: string, step: number, line: string): Action[] {
  return [
    {
      if: { var: 'offerStep', eq: step - 1 },
      then: [
        { take: item },
        { flag: `offered_${item}` },
        { setVar: 'offerStep', value: step },
        { sfx: 'click' },
        { say: [line] },
        { if: { var: 'offerStep', eq: 3 }, then: [{ run: 'hanakoReturns' }], else: [{ run: 'offerMenu' }] },
      ],
      else: [{ run: 'offerWrong' }],
    },
  ];
}

export const houses: StagePart = {
  notes: [
    {
      id: 'n_alley',
      title: '知らない路地',
      body: '店を出ると、古い板塀の路地に立っていた。\n赤いスカートの女の子が、先へ先へと現れては消える。',
    },
    {
      id: 'n_nameplate',
      title: '削られた表札',
      body: '路地の突き当たりの家。表札の名字は削り取られていた。\n下の方に、小さく「花子」とだけ残っている。',
    },
    {
      id: 'n_phone1',
      title: '黒電話（一）',
      body: '「はなこ、今日はピアノの練習で遅くなるのね。\n暗くなる前に、気をつけて帰ってくるのよ」\n……二月十四日の朝の声だろうか。',
    },
    {
      id: 'n_renrakucho',
      title: '連絡帳',
      body: '「二月十四日（金）ほうかご、音楽室でピアノのれんしゅう。はっぴょうかいまで、あとすこし。\nかえりに、トイレによります」',
    },
    {
      id: 'n_calendarH',
      title: '止まったカレンダー',
      body: '子供部屋のカレンダー。二月十四日に赤い丸と「ピアノ」。\nその先は、一枚もめくられていない。',
    },
    {
      id: 'n_offerOrder',
      title: '祖母のメモ',
      body: '仏壇の引き出しの、震えた字のメモ。\n「はなこへの　おそなえは　お花、お線香、お菓子の　じゅんばんに」',
    },
    {
      id: 'n_matches',
      title: 'マッチ',
      body: '台所の引き出しにあった古いマッチ。\n線香に火を点けるのに使えそうだ。',
    },
    {
      id: 'n_hanakoHome',
      title: 'おうちに帰れた子',
      body: 'お供えを終えると、仏間に花子さんが立っていた。\n「……ありがとう。やっと、おうちにかえってこられた」',
    },
    {
      id: 'n_phone2',
      title: '黒電話（二）',
      body: '「あなたも、おうちにかえってね。\nでもね、おうちについても『ただいま』っていっちゃだめだよ。\nあそこはまだ、こっちがわだから」',
    },
    {
      id: 'n_homeRule',
      title: 'おうちのきまり',
      body: '下駄箱の上のメモ。子どもの字。\n一、ただいまを　いわない　二、ごはんよって　よばれても　だいどころに　いかない\n三、じぶんの　おふとんで　ねない　四、でんわが　なったら　でる　　（はなこ）',
    },
    {
      id: 'n_tadaima',
      title: 'おかえり',
      body: '「ただいま」と言うと、家の奥から何人もの声が「おかえり」と返事をした。\n……ここは、『ただいま』を言ってはいけない家だ。',
    },
    {
      id: 'n_photo',
      title: '家族写真',
      body: '父と母と、自分の写真。\n自分の顔だけが、白くぼやけて写っていない。',
    },
    {
      id: 'n_seven7',
      title: '七不思議の七つ目',
      body: 'テレビの砂嵐の奥に、ときどき文字が浮かぶ。\n「七、知ってはいけない」',
    },
    {
      id: 'n_kitchen',
      title: '台所の「母」',
      body: '「ごはんよ」と呼ばれて台所へ行くと、流しに向かっていた「母」が振り向いた。\n顔を見る前に、玄関まで逃げ戻っていた。',
    },
  ],
  items: [{ id: 'matches', name: 'マッチ' }],
  interactables: [
    // ---------------- 花子さんの家 ----------------
    {
      id: 'nameplate',
      name: '表札',
      reactions: [
        {
          actions: [
            { say: ['古い木の表札。名字のところが、刃物で削り取られている。', '……下の方に、小さく「花子」とだけ残っている。'] },
            { note: 'n_nameplate' },
          ],
        },
      ],
    },
    {
      id: 'hanakoPhone',
      name: '黒電話',
      reactions: [
        {
          when: { all: [{ flag: 'phone2Ringing' }, { notFlag: 'phone2Done' }] },
          actions: [
            { say: ['受話器を取った。'] },
            {
              say: [
                { speaker: '電話の声', text: '……もしもし。わたし、はなこ。', style: 'ghost' },
                { speaker: '電話の声', text: 'あなたも、おうちに　かえってね。', style: 'ghost' },
                { speaker: '電話の声', text: 'でもね、おうちに　ついても、「ただいま」って　いっちゃ　だめだよ。', style: 'ghost' },
                { speaker: '電話の声', text: 'あそこは　まだ、こっちがわ　だから。', style: 'ghost' },
                { speaker: '電話の声', text: '……きまりは、げたばこの　うえに　おいておくね。', style: 'ghost' },
              ],
            },
            { say: ['……電話は切れた。'] },
            { flag: 'phone2Done' },
            { note: 'n_phone2' },
          ],
        },
        {
          when: { all: [{ flag: 'phone1Ringing' }, { notFlag: 'phone1Done' }] },
          actions: [
            { say: ['受話器を取った。……雑音の向こうで、女の人の声がする。'] },
            {
              say: [
                { speaker: '電話の声', text: 'はなこ、今日はピアノの練習で遅くなるのね。', style: 'ghost' },
                { speaker: '電話の声', text: '暗くなる前に、気をつけて帰ってくるのよ。', style: 'ghost' },
              ],
            },
            { say: ['……プツリと切れた。', '今の声は、いつの電話だったのだろう。'] },
            { flag: 'phone1Done' },
            { note: 'n_phone1' },
          ],
        },
        { actions: [{ say: ['古い黒電話。受話器は氷のように冷たい。'] }] },
      ],
    },
    {
      id: 'butsumaDoor',
      name: '仏間の襖',
      reactions: [
        { when: { flag: 'butsumaOpen' }, actions: [{ say: ['襖は開いている。'] }] },
        { actions: [{ flag: 'butsumaOpen' }, { open: 'butsumaDoor' }, { say: ['襖を開けた。……線香のにおいが、かすかに残っている。'] }] },
      ],
    },
    {
      id: 'butsudan',
      name: '仏壇',
      reactions: [
        { when: { flag: 'hanakoHome' }, actions: [{ say: ['線香の煙が、まっすぐに立ちのぼっている。', '遺影の女の子が、少し笑っている気がした。'] }] },
        {
          when: { note: 'n_offerOrder' },
          actions: [{ run: 'offerMenu' }],
        },
        {
          actions: [
            { say: ['小さな仏壇。遺影には、おかっぱ頭の女の子が写っている。', '花立ても香炉も、空っぽだ。', '引き出しに、震えた字のメモが入っていた。', '「はなこへの　おそなえは　お花、お線香、お菓子の　じゅんばんに」'] },
            { note: 'n_offerOrder' },
            { run: 'offerMenu' },
          ],
        },
      ],
    },
    {
      id: 'kitchenDrawer',
      name: '台所の引き出し',
      reactions: [
        { when: { flag: 'matchesTaken' }, actions: [{ say: ['引き出しは空だ。'] }] },
        {
          actions: [
            { sfx: 'pickup' },
            { flag: 'matchesTaken' },
            { give: 'matches' },
            { say: ['引き出しに、古いマッチ箱が入っていた。……まだ使えそうだ。'] },
            { note: 'n_matches' },
          ],
        },
      ],
    },
    {
      id: 'randoseru',
      name: 'ランドセル',
      reactions: [
        {
          actions: [
            { sfx: 'page' },
            { say: ['赤いランドセル。中に連絡帳が入っている。', '「二月十四日（金）ほうかご、音楽室でピアノのれんしゅう。はっぴょうかいまで、あとすこし」', '「かえりに、トイレによります」'] },
            { note: 'n_renrakucho' },
          ],
        },
      ],
    },
    {
      id: 'calendarH',
      name: 'カレンダー',
      reactions: [
        { actions: [{ say: ['二月のカレンダー。十四日に赤い丸と「ピアノ」。', 'その先は、一枚もめくられていない。'] }, { note: 'n_calendarH' }] },
      ],
    },
    // ---------------- 自分の家 ----------------
    {
      id: 'homeDoor',
      name: '玄関の扉',
      reactions: [
        { when: { flag: 'homeEntered' }, actions: [{ say: ['玄関の扉は開いている。'] }] },
        {
          actions: [
            {
              choice: {
                prompt: '自分の家の玄関だ。……鍵は開いている。',
                options: [
                  { label: '「ただいま」と言って入る', actions: [{ run: 'saidTadaima' }] },
                  {
                    label: '黙って入る',
                    actions: [{ open: 'homeDoor' }, { flag: 'homeEntered' }, { sfx: 'creak' }, { say: ['……何も言わずに、扉を開けた。'] }],
                  },
                  { label: 'やめる', actions: [] },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'homeMemo',
      name: 'メモ',
      reactions: [
        {
          actions: [
            { sfx: 'page' },
            { say: ['下駄箱の上に、子どもの字のメモ。「おうちのきまり」', '一、ただいまを　いわない', '二、ごはんよって　よばれても　だいどころに　いかない', '三、じぶんの　おふとんで　ねない', '四、でんわが　なったら　でる', '……最後に「はなこ」と書いてある。'] },
            { note: 'n_homeRule' },
          ],
        },
      ],
    },
    {
      id: 'familyPhoto',
      name: '家族写真',
      reactions: [
        {
          actions: [
            { say: ['居間に飾られた家族写真。父と母と、自分。', '……自分の顔だけが、白くぼやけて写っていない。'] },
            { flag: 'photoSeen' },
            { note: 'n_photo' },
          ],
        },
      ],
    },
    {
      id: 'tv',
      name: 'テレビ',
      reactions: [
        {
          actions: [
            { say: ['テレビが点けっぱなしだ。砂嵐しか映っていない。', '……ときどき、ノイズの奥に文字が浮かぶ。', '「七、知ってはいけない」'] },
            {
              if: { flag: 'truthSeen' },
              then: [{ sfx: 'whisper' }, { say: [{ text: '……もう、知ってしまったね', style: 'whisper' }] }],
            },
            { flag: 'tvSeen' },
            { note: 'n_seven7' },
          ],
        },
      ],
    },
    {
      id: 'myBed',
      name: '自分のベッド',
      reactions: [
        {
          actions: [
            {
              choice: {
                prompt: '自分のベッドだ。……ひどく眠い。',
                options: [
                  { label: '横になる', actions: [{ run: 'badEnd' }] },
                  { label: 'やめる', actions: [{ say: ['……だめだ。ここで寝ちゃいけない気がする。'] }] },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'bathDoor',
      name: '風呂場の扉',
      reactions: [{ actions: [{ say: ['風呂場の扉。中で、水の流れる音がずっとしている。', '……開けないでおこう。'] }] }],
    },
    {
      id: 'homePhone',
      name: '電話',
      reactions: [
        { when: { flag: 'homePhoneRinging' }, actions: [{ run: 'answerHome' }] },
        { actions: [{ say: ['廊下の電話。……今は鳴っていない。'] }] },
      ],
    },
  ],
  scripts: {
    /** コンビニを出ると、知らない路地にいる */
    toAlley: [
      { fx: 'fadeOut', duration: 2 },
      { teleport: 'alleyStart' },
      { flag: 'inAlley' },
      { wait: 600 },
      { fx: 'fadeIn', duration: 2 },
      { say: ['店を出ると、霧の道は消えていた。', '古い板塀にはさまれた、知らない路地に立っている。'] },
      { look: 'hanakoLead1' },
      { meter: 0.6 },
      { say: ['……道の先に、赤いスカートの女の子がいる。', 'こっちへおいで、と言うように、じっとこちらを見ている。'] },
      { note: 'n_alley' },
    ],
    offerMenu: [
      {
        choice: {
          prompt: '仏壇に、何を供える？',
          options: [
            { label: '菊の花', when: { item: 'kiku' }, actions: offer('kiku', 1, '花立てに、菊の花を挿した。') },
            {
              label: '線香',
              when: { item: 'senko' },
              actions: [
                {
                  if: { noItem: 'matches' },
                  then: [{ say: ['……火がないと、線香はあげられない。'] }],
                  else: offer('senko', 2, 'マッチを擦って、線香に火を点けた。細い煙が立ちのぼる。'),
                },
              ],
            },
            { label: 'まんじゅう', when: { item: 'manju' }, actions: offer('manju', 3, 'おまんじゅうを、そっと供えた。') },
            { label: 'やめる', actions: [] },
          ],
        },
      },
    ],
    offerWrong: [
      { rattle: ['butsumaDoor'], duration: 1.2 },
      { fx: 'strobe', duration: 1.2, target: 'butsuma' },
      { meter: 0.9 },
      { say: [{ speaker: '仏間の奥から', text: '……ちがうでしょう', style: 'ghost' }] },
      { damage: 10 },
      { say: ['しわがれた、おばあさんの声だった。', '……順番が、違うらしい。'] },
    ],
    hanakoReturns: [
      { wait: 600 },
      { flag: 'hanakoThanksShow' },
      { look: 'hanakoThanks' },
      { sfx: 'chime' },
      { say: ['……仏壇の前に、女の子が座っていた。'] },
      {
        say: [
          { speaker: '花子', text: '……ありがとう', style: 'ghost' },
          { speaker: '花子', text: 'おばあちゃんの、おせんこうの　におい', style: 'ghost' },
          { speaker: '花子', text: 'やっと、おうちに　かえってこられた', style: 'ghost' },
        ],
      },
      { fx: 'flashFlicker', duration: 0.6 },
      { flag: 'hanakoThanksShow', value: false },
      { flag: 'hanakoHome' },
      { note: 'n_hanakoHome' },
      { say: ['……女の子は、いなくなっていた。'] },
      { wait: 800 },
      { sfx: 'ring' },
      { flag: 'phone2Ringing' },
      { say: ['……居間で、黒電話が鳴っている。'] },
    ],
    /** 花子さんの家を出て、自分の家へ */
    toHome: [
      { fx: 'fadeOut', duration: 2 },
      { flag: 'inAlley', value: false },
      { teleport: 'homeStreet' },
      { flag: 'atHome' },
      { wait: 600 },
      { fx: 'fadeIn', duration: 2 },
      { say: ['……気がつくと、見慣れた道に立っていた。', '自分の家だ。窓に、明かりが点いている。', '……帰ってきた。本当に？'] },
    ],
    saidTadaima: [
      { say: [{ speaker: 'あなた', text: '「ただいま」' }] },
      { wait: 700 },
      { meter: 1 },
      { fx: 'strobe', duration: 1.6, target: 'kitchen' },
      { sfx: 'whisper' },
      {
        say: [
          { speaker: '家の奥から', text: '……おかえり', style: 'ghost' },
          { speaker: '家の奥から', text: 'おかえり　おかえり', style: 'ghost' },
          { speaker: '家の奥から', text: 'おかえりなさい　おかえりなさい　おかえりなさい', style: 'ghost' },
        ],
      },
      { sfx: 'slam' },
      { damage: 25 },
      { say: ['……扉の向こうから、何人もの声がいっせいに返事をした。', 'うちには、そんなに人はいない。', '『ただいま』を言ってはいけなかったのだ。'] },
      { note: 'n_tadaima' },
    ],
    /** 「ごはんよ」に呼ばれて台所へ入ってしまった */
    kitchenTrap: [
      { flag: 'motherTurnedShow' },
      { look: 'motherTurned' },
      { sfx: 'stinger' },
      { meter: 1 },
      { say: ['……！', '流しに向かっていた「母」が、ゆっくりと振り向いた——'] },
      { damage: 25 },
      { fx: 'fadeOut', duration: 0.5 },
      { flag: 'motherTurnedShow', value: false },
      { teleport: 'homeIn' },
      { fx: 'fadeIn', duration: 1 },
      { say: ['……気がつくと、玄関に立っていた。', '顔は、見なかった。見なくてよかった。'] },
      { note: 'n_kitchen' },
    ],
    answerHome: [
      { flag: 'homePhoneRinging', value: false },
      { say: ['受話器を取った。'] },
      {
        if: { flag: 'truthSeen' },
        then: [
          {
            say: [
              { speaker: '電話の声', text: '……聞こえる？', style: 'ghost' },
              { speaker: '電話の声', text: 'あなた、昨日の放課後から、ずっと保健室で眠っていたのよ。', style: 'ghost' },
              { speaker: '電話の声', text: 'お願い。……目を開けて。', style: 'ghost' },
            ],
          },
          { say: ['保健の先生の声だ。……保健室のベッドで眠っていたのは、やっぱり。'] },
          { choice: { options: [{ label: '目を開ける', actions: [{ run: 'trueEnd' }] }] } },
        ],
        else: [
          {
            say: [
              { speaker: '電話の声', text: '……もしもし？　どこにいるの？', style: 'ghost' },
              { speaker: '電話の声', text: 'もう朝よ。……起きなさい。', style: 'ghost' },
            ],
          },
          { say: ['母さんの声だ。台所の「母」とは、違う。'] },
          { choice: { options: [{ label: '「今、帰るよ」と答える', actions: [{ run: 'normalEnd' }] }] } },
        ],
      },
    ],
    trueEnd: [
      { fx: 'fadeOut', duration: 2.5 },
      {
        say: [
          '……まぶしい。',
          '白い天井が見えた。保健室のベッドの上だった。窓の外は、もう朝だ。',
          '枕元に、菊の花と線香の箱と、おまんじゅうが置かれていた。',
          { text: '……またあそぼうね', style: 'whisper' },
        ],
      },
      { clear: true, title: '目覚め', text: '保健室で眠っていたのは、あなた自身だった。<br>七不思議の七つ目は——もう、知ってしまった。' },
    ],
    normalEnd: [
      { fx: 'fadeOut', duration: 2.5 },
      {
        say: [
          '……目を開けると、自分の部屋の天井が見えた。',
          '朝だ。台所から、いつもの母さんの声がする。',
          '……昨日の夜のことは、よく思い出せない。',
          '机の上に、菊の花と線香とおまんじゅうの袋が置いてあった。',
        ],
      },
      { clear: true, title: '帰宅', text: '保健室の寝息は、誰のものだったのだろう。<br>……七不思議の七つ目は、知らないほうがいい。' },
    ],
    badEnd: [
      { say: ['……少しだけ、横になろう。', '布団は、あたたかい。まぶたが、どんどん重くなる。'] },
      { say: [{ speaker: '台所から', text: '……おかえり', style: 'ghost' }] },
      { fx: 'fadeOut', duration: 3 },
      { clear: true, title: 'おかえり', text: 'あなたは、この家で眠り続ける。<br>「じぶんの　おふとんで　ねない」——きまりの三つ目を、守れなかった。' },
    ],
  },
  triggers: [
    // 路地：近づくと消えて、先に現れる
    {
      id: 'lead1',
      area: { minX: 5, maxX: 7.5, minZ: ZH - 1.6, maxZ: ZH + 1.6 },
      when: { flag: 'inAlley' },
      actions: [{ flag: 'lead1Gone' }, { sfx: 'laugh' }, { meter: 0.5 }, { say: [{ text: '……こっち', style: 'whisper' }] }],
    },
    {
      id: 'lead2',
      area: { minX: 14, maxX: 16, minZ: ZH - 1.6, maxZ: ZH + 1.6 },
      when: { flag: 'lead1Gone' },
      actions: [{ flag: 'lead2Gone' }, { meter: 0.5 }, { say: [{ text: '……こっちだよ', style: 'whisper' }] }],
    },
    {
      id: 'lead3',
      area: { minX: 21.5, maxX: 23.6, minZ: ZH - 1.6, maxZ: ZH + 1.6 },
      when: { flag: 'lead2Gone' },
      actions: [{ flag: 'lead3Gone' }, { say: ['女の子は、門の中へ消えた。'] }],
    },
    {
      id: 'hanakoHouseEnter',
      area: { minX: 26.2, maxX: 28, minZ: ZH - 0.9, maxZ: ZH + 0.9 },
      actions: [{ flag: 'inHanakoHouse' }, { say: ['……お邪魔します。', '中は、古い木と畳のにおいがする。誰も住んでいないようだ。'] }],
    },
    {
      id: 'livingRing',
      area: { minX: 26.2, maxX: 31.9, minZ: ZH - 5.9, maxZ: ZH - 1 },
      actions: [{ sfx: 'ring' }, { flag: 'phone1Ringing' }, { meter: 0.6 }, { say: ['……箪笥の上の黒電話が、鳴り出した。'] }],
    },
    {
      id: 'leaveHanakoHouse',
      area: { minX: 24, maxX: 25.8, minZ: ZH - 1.5, maxZ: ZH + 1.5 },
      when: { flag: 'phone2Done' },
      actions: [{ run: 'toHome' }],
    },
    // 自分の家
    {
      id: 'homeHall',
      area: { minX: 13.6, maxX: 19, minZ: ZM - 0.9, maxZ: ZM + 0.9 },
      when: { flag: 'homeEntered' },
      actions: [
        { say: [{ speaker: '台所から', text: '……ごはんよー', style: 'ghost' }] },
        { flag: 'dinnerCalled' },
        { say: ['……母さんの声？', 'でも、何かが違う。声が、少しだけ低い。'] },
      ],
    },
    {
      id: 'kitchenEnter',
      area: { minX: 18.2, maxX: 23.8, minZ: ZM - 4.9, maxZ: ZM - 1.1 },
      when: { flag: 'dinnerCalled' },
      once: false,
      actions: [{ run: 'kitchenTrap' }],
    },
    {
      id: 'homePhoneRing',
      area: { minX: 12.2, maxX: 23.8, minZ: ZM - 4.9, maxZ: ZM + 4.9 },
      when: { all: [{ flag: 'photoSeen' }, { flag: 'tvSeen' }, { note: 'n_homeRule' }] },
      actions: [{ wait: 600 }, { sfx: 'ring' }, { meter: 0.7 }, { flag: 'homePhoneRinging' }, { say: ['……廊下の電話が、鳴っている。'] }],
    },
  ],
  presences: [
    { id: 'butsuma', x: 36, z: ZH - 3.4, radius: 6, strength: 0.35, when: { notFlag: 'hanakoHome' } },
    { id: 'mother', x: 21, z: ZM - 4, radius: 7, strength: 0.75, when: { flag: 'homeEntered' } },
    { id: 'bath', x: 20.5, z: ZM + 3, radius: 3, strength: 0.4, when: { flag: 'homeEntered' } },
  ],
  visibility: [
    { id: 'hanakoLead1', when: { notFlag: 'lead1Gone' } },
    { id: 'hanakoLead2', when: { all: [{ flag: 'lead1Gone' }, { notFlag: 'lead2Gone' }] } },
    { id: 'hanakoLead3', when: { all: [{ flag: 'lead2Gone' }, { notFlag: 'lead3Gone' }] } },
    { id: 'hanakoThanks', when: { flag: 'hanakoThanksShow' } },
    { id: 'altarKiku', when: { flag: 'offered_kiku' } },
    { id: 'altarSenko', when: { flag: 'offered_senko' } },
    { id: 'altarManju', when: { flag: 'offered_manju' } },
    { id: 'mother', when: { notFlag: 'motherTurnedShow' } },
    { id: 'motherTurned', when: { flag: 'motherTurnedShow' } },
  ],
};
