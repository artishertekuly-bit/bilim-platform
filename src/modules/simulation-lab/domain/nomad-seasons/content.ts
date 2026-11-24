// Learner-facing copy for the nomad seasons simulation (Kazakh). Pure data, shared by the UI,
// the 2D/3D renderers and the tutor summary.
import type { PastureId, Season, Trend, Verdict } from './model';

export const SEASON_TITLES: Readonly<Record<Season, string>> = {
  spring: 'Көктем',
  summer: 'Жаз',
  autumn: 'Күз',
  winter: 'Қыс',
};

export interface PastureInfo {
  title: string;
  short: string;
  description: string;
}

export const PASTURE_INFO: Readonly<Record<PastureId, PastureInfo>> = {
  kokteu: {
    title: 'Көктеу',
    short: 'Көктемгі жайылым',
    description: 'Қары ерте кетіп, шөбі ерте көктейтін жер. Мал осында төлдейтін.',
  },
  zhailau: {
    title: 'Жайлау',
    short: 'Жазғы жайылым',
    description: 'Таудың биік беткейі немесе солтүстік дала. Жазда шөбі шүйгін, суы мол.',
  },
  kuzeu: {
    title: 'Күзеу',
    short: 'Күзгі жайылым',
    description: 'Мал қысқа дейін қоңданатын жер. Көбіне көктеу мен қыстаудың арасында болған.',
  },
  kystau: {
    title: 'Қыстау',
    short: 'Қысқы қоныс',
    description: 'Желден қорғалған өзен аңғары не тау бөктері. Қар аз жатады, сондықтан мал қыста шөпке жете алады.',
  },
};

export const MODEL_NOTE =
  'Бұл — жеңілдетілген оқу моделі. Шөп пен малдың сандары шартты, олар тарихи статистика емес. Модель көшпелілердің неге маусым сайын көшкенін түсінуге көмектеседі.';

export const JUT_NOTE =
  'Жұт — қыс қатты болғанда немесе қар бетін мұз қатқанда (көктайғақ) мал шөпке жете алмай, жаппай шығынға ұшырайтын апат.';

export const OBJECTIVE =
  'Көшпелі қазақтардың неге төрт маусымдық жайылымды (көктеу, жайлау, күзеу, қыстау) кезекпен ауыстырғанын модельде тексеру.';

export const OBJECTIVES: readonly string[] = [
  'Төрт маусымдық жайылымның атауы мен қызметін білу',
  'Ауыл бір жерде отырып қалса, жайылымға не болатынын түсіндіру',
  'Жұттың мал шаруашылығына қаупін бағалау',
];

export const HYPOTHESIS_QUESTION = 'Таңдаған жоспарың бойынша үш жылдан кейін мал саны қалай өзгереді деп ойлайсың?';

export const HYPOTHESIS_OPTIONS: readonly { id: Trend; label: string }[] = [
  { id: 'growth', label: 'Көбейеді' },
  { id: 'stable', label: 'Шамамен сол күйде қалады' },
  { id: 'decline', label: 'Азаяды' },
];

export const TREND_TITLES: Readonly<Record<Trend, string>> = {
  growth: 'көбейді',
  stable: 'шамамен сол күйде қалды',
  decline: 'азайды',
};

export const VERDICT_TEXT: Readonly<Record<Verdict, { title: string; text: string }>> = {
  balanced: {
    title: 'Жайылым мен мал теңгерімде',
    text: 'Мал әр маусымда жеткілікті оттады, ал тынығып тұрған жайылымдардың шөбі қайта өсті.',
  },
  strained: {
    title: 'Мал кейбір маусымда аш қалды',
    text: 'Бір маусымда шөп малдың қажетінен аз болды. Қай маусымда және қай жайылымда қиын болғанын кестеден қара.',
  },
  collapse: {
    title: 'Мал шаруашылығы күйреді',
    text: 'Мал саны екі еседен астам азайды. Жайылым тынықпаса, шөбі қайта өсіп үлгермейді.',
  },
};

export const CHECK_QUESTION = 'Көшпелілер жазда малды неге жайлауға айдаған?';

export const CHECK_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'rest', label: 'Жайлауда жазда шөп шүйгін, ал көктеу мен қыстау осы кезде тынығып, шөбі қайта өседі' },
  { id: 'warm', label: 'Жайлауда қыс жылы болып, қар түспейді' },
  { id: 'water', label: 'Жазда мал шөп жемейді, тек су ішеді' },
  { id: 'farm', label: 'Жайлаудың жері егін егуге ыңғайлы болған' },
];

export const CHECK_CORRECT_ID = 'rest';

export const CHECK_EXPLANATION =
  'Дұрыс жауап: жайлауда жазда шөп шүйгін болады, ал басқа жайылымдар осы уақытта тынығады. Модельде де тынығып тұрған жайылымның шөбі қайта өседі.';
