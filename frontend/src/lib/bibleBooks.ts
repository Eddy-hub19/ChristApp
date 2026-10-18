/**
 * Каталог 66 книг (коди USFM, як у API) з назвами та скороченнями ua/ru/en
 * і парсер біблійних посилань: «Ін 3:16», «Иоанна 3:16», «1 Кор 13:4-7», «Буття 1».
 */

export type BibleBookInfo = {
  id: string;
  /** 1…66 — збігається з `bookid` у API. */
  num: number;
  testament: "old" | "new";
  names: { ua: string; ru: string; en: string };
  /** Додаткові скорочення (будь-якою мовою — посилання розпізнаються незалежно від мови інтерфейсу). */
  aliases: string[];
};

// [id, ua, ru, en, aliases (через пробіл; пробіли всередині скорочення не потрібні)]
const RAW: Array<[string, string, string, string, string]> = [
  ["GEN", "Буття", "Бытие", "Genesis", "бут быт gen ge gn"],
  ["EXO", "Вихід", "Исход", "Exodus", "вих исх exo ex exod"],
  ["LEV", "Левит", "Левит", "Leviticus", "лев lev le lv"],
  ["NUM", "Числа", "Числа", "Numbers", "чис чс num nu nm nb"],
  ["DEU", "Повторення Закону", "Второзаконие", "Deuteronomy", "повт втор вт deu dt deut"],
  ["JOS", "Ісуса Навина", "Иисус Навин", "Joshua", "нав існ иис jos josh jsh"],
  ["JDG", "Суддів", "Судей", "Judges", "суд сд jdg judg jg"],
  ["RUT", "Рут", "Руфь", "Ruth", "рут руф rut ru"],
  ["1SA", "1 Самуїлова", "1 Царств", "1 Samuel", "1сам 1цар 1сам 1sa 1sam 1sm"],
  ["2SA", "2 Самуїлова", "2 Царств", "2 Samuel", "2сам 2цар 2sa 2sam 2sm"],
  ["1KI", "1 Царів", "3 Царств", "1 Kings", "1цр 3цар 1ки 1ki 1kgs 1kin"],
  ["2KI", "2 Царів", "4 Царств", "2 Kings", "2цр 4цар 2ки 2ki 2kgs 2kin"],
  ["1CH", "1 Хроніки", "1 Паралипоменон", "1 Chronicles", "1хр 1пар 1ch 1chr"],
  ["2CH", "2 Хроніки", "2 Паралипоменон", "2 Chronicles", "2хр 2пар 2ch 2chr"],
  ["EZR", "Ездра", "Ездра", "Ezra", "езд ezr"],
  ["NEH", "Неемія", "Неемия", "Nehemiah", "нее неем neh ne"],
  ["EST", "Естер", "Есфирь", "Esther", "ест есф est esth"],
  ["JOB", "Йов", "Иов", "Job", "йов иов job jb"],
  ["PSA", "Псалми", "Псалтирь", "Psalms", "пс псл псалом псалмы psa ps psalm pslm"],
  ["PRO", "Приповісті", "Притчи", "Proverbs", "пр прип прит pro prov prv"],
  ["ECC", "Екклезіяст", "Екклесиаст", "Ecclesiastes", "екк еккл ecc eccl qoh"],
  ["SNG", "Пісня над піснями", "Песня Песней", "Song of Solomon", "пісн пес песн sng song sos ss songofsongs"],
  ["ISA", "Ісая", "Исаия", "Isaiah", "іс ис исаи isa is"],
  ["JER", "Єремія", "Иеремия", "Jeremiah", "єр иер jer je"],
  ["LAM", "Плач Єремії", "Плач Иеремии", "Lamentations", "плач lam la"],
  ["EZK", "Єзекіїль", "Иезекииль", "Ezekiel", "єз иез ezk eze ezek"],
  ["DAN", "Даниїл", "Даниил", "Daniel", "дан dan dn da"],
  ["HOS", "Осія", "Осия", "Hosea", "ос hos ho"],
  ["JOL", "Йоїл", "Иоиль", "Joel", "йоїл иоил joe jol jl"],
  ["AMO", "Амос", "Амос", "Amos", "ам amo am"],
  ["OBA", "Овдій", "Авдий", "Obadiah", "овд авд oba ob obad"],
  ["JON", "Йона", "Иона", "Jonah", "йон jon jnh"],
  ["MIC", "Михей", "Михей", "Micah", "мих mic mi"],
  ["NAM", "Наум", "Наум", "Nahum", "нау nam na nah"],
  ["HAB", "Авакум", "Аввакум", "Habakkuk", "авак авв hab hb"],
  ["ZEP", "Софонія", "Софония", "Zephaniah", "соф zep zeph zp"],
  ["HAG", "Огій", "Аггей", "Haggai", "ог агг hag hg"],
  ["ZEC", "Захарія", "Захария", "Zechariah", "зах zec zech zc"],
  ["MAL", "Малахія", "Малахия", "Malachi", "мал mal ml"],
  ["MAT", "Матвія", "Матфея", "Matthew", "мт мф матв матф mat matt mt"],
  ["MRK", "Марка", "Марка", "Mark", "мр мк марк mrk mar mk mark"],
  ["LUK", "Луки", "Луки", "Luke", "лк лук luk lu lk"],
  ["JHN", "Івана", "Иоанна", "John", "ін іван іоан йн иоан ин jhn joh jn"],
  ["ACT", "Дії", "Деяния", "Acts", "дії діян дея деян act ac"],
  ["ROM", "Римлян", "Римлянам", "Romans", "рим римл rom ro rm"],
  ["1CO", "1 Коринтян", "1 Коринфянам", "1 Corinthians", "1кор 1co 1cor"],
  ["2CO", "2 Коринтян", "2 Коринфянам", "2 Corinthians", "2кор 2co 2cor"],
  ["GAL", "Галатів", "Галатам", "Galatians", "гал gal ga"],
  ["EPH", "Ефесян", "Ефесянам", "Ephesians", "еф ефес eph ep"],
  ["PHP", "Филип'ян", "Филиппийцам", "Philippians", "фил флп филип php phil pp"],
  ["COL", "Колосян", "Колоссянам", "Colossians", "кол колос col"],
  ["1TH", "1 Солунян", "1 Фессалоникийцам", "1 Thessalonians", "1сол 1фес 1th 1thes 1thess"],
  ["2TH", "2 Солунян", "2 Фессалоникийцам", "2 Thessalonians", "2сол 2фес 2th 2thes 2thess"],
  ["1TI", "1 Тимофія", "1 Тимофею", "1 Timothy", "1тим 1тимофея 1ти 1ti 1tim"],
  ["2TI", "2 Тимофія", "2 Тимофею", "2 Timothy", "2тим 2тимофея 2ти 2ti 2tim"],
  ["TIT", "Тита", "Титу", "Titus", "тит tit"],
  ["PHM", "Филимона", "Филимону", "Philemon", "флм филим phm phlm philem"],
  ["HEB", "Євреїв", "Евреям", "Hebrews", "євр евр heb"],
  ["JAS", "Якова", "Иакова", "James", "як иак jas jam jm"],
  ["1PE", "1 Петра", "1 Петра", "1 Peter", "1пет 1пт 1pe 1pet 1pt"],
  ["2PE", "2 Петра", "2 Петра", "2 Peter", "2пет 2пт 2pe 2pet 2pt"],
  ["1JN", "1 Івана", "1 Иоанна", "1 John", "1ін 1іоан 1ин 1иоан 1jn 1jo 1joh 1jhn"],
  ["2JN", "2 Івана", "2 Иоанна", "2 John", "2ін 2іоан 2ин 2иоан 2jn 2jo 2joh 2jhn"],
  ["3JN", "3 Івана", "3 Иоанна", "3 John", "3ін 3іоан 3ин 3иоан 3jn 3jo 3joh 3jhn"],
  ["JUD", "Юди", "Иуды", "Jude", "юд иуд jud jde"],
  ["REV", "Об'явлення", "Откровение", "Revelation", "об откр rev re apoc"],
];

export const BIBLE_BOOKS: BibleBookInfo[] = RAW.map(
  ([id, ua, ru, en, aliases], i) => ({
    id,
    num: i + 1,
    testament: i < 39 ? "old" : "new",
    names: { ua, ru, en },
    aliases: aliases.split(" "),
  }),
);

const BOOK_BY_ID = new Map(BIBLE_BOOKS.map((b) => [b.id, b]));

export function getBookInfo(id: string): BibleBookInfo | undefined {
  return BOOK_BY_ID.get(id);
}

export function isOldTestamentBook(id: string): boolean {
  return BOOK_BY_ID.get(id)?.testament === "old";
}

const FOLD: Record<string, string> = {
  ё: "е",
  і: "и",
  ї: "и",
  є: "е",
  ґ: "г",
  ʼ: "'",
  "’": "'",
  "`": "'",
  "ʹ": "'",
};

/** Посимвольне згортання (довжина рядка зберігається): регістр, ё/е, і/и, ї/и, є/е, ґ/г, апострофи. */
export function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  const mapped = FOLD[lower] ?? lower;
  return mapped.length === 1 ? mapped : ch;
}

export function foldText(text: string): string {
  let out = "";
  for (const ch of text) out += foldChar(ch);
  return out;
}

const ROMAN_PREFIX: Record<string, string> = { i: "1", ii: "2", iii: "3" };

/** Ключ для порівняння назв книг: без пробілів, крапок і апострофів; I/II/III → 1/2/3. */
export function bookKey(raw: string): string {
  let s = raw.trim().replace(/^(iii|ii|i)(?=[\s.]+\S)/i, (m) => {
    return ROMAN_PREFIX[m.toLowerCase()] ?? m;
  });
  s = s.replace(/^(\d)(?:-?(?:я|й|е|ша|ша|st|nd|rd))(?=\s|\.|[^\d])/iu, "$1");
  s = foldText(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['.\s_-]+/g, "");
  return s;
}

export type BibleReference = {
  bookId: string;
  chapter?: number;
  verseFrom?: number;
  verseTo?: number;
};

type NamedBook = { id: string; name?: string };

type KeyIndex = { key: string; id: string }[];

function buildIndex(books: NamedBook[] | undefined): {
  exact: Map<string, Set<string>>;
  all: KeyIndex;
} {
  const exact = new Map<string, Set<string>>();
  const all: KeyIndex = [];
  const add = (key: string, id: string) => {
    if (!key) return;
    all.push({ key, id });
    const set = exact.get(key) ?? new Set<string>();
    set.add(id);
    exact.set(key, set);
  };
  for (const b of BIBLE_BOOKS) {
    add(bookKey(b.names.ua), b.id);
    add(bookKey(b.names.ru), b.id);
    add(bookKey(b.names.en), b.id);
    for (const a of b.aliases) add(bookKey(a), b.id);
  }
  for (const b of books ?? []) {
    if (b?.id && b.name && BOOK_BY_ID.has(b.id)) add(bookKey(b.name), b.id);
  }
  return { exact, all };
}

const DEFAULT_INDEX = buildIndex(undefined);

const indexCache = new WeakMap<object, ReturnType<typeof buildIndex>>();

function getIndex(books: NamedBook[] | undefined) {
  if (!books || books.length === 0) return DEFAULT_INDEX;
  let idx = indexCache.get(books);
  if (!idx) {
    idx = buildIndex(books);
    indexCache.set(books, idx);
  }
  return idx;
}

/** Книга за повною назвою, скороченням або унікальним початком назви. */
export function resolveBookId(
  rawName: string,
  books?: NamedBook[],
): string | null {
  const key = bookKey(rawName);
  if (key.length < 2 && !/^\d\D/.test(key)) return null;
  if (!key) return null;
  const { exact, all } = getIndex(books);

  const hit = exact.get(key);
  if (hit && hit.size === 1) return [...hit][0];
  if (hit && hit.size > 1) return null;

  const ids = new Set<string>();
  for (const e of all) if (e.key.startsWith(key)) ids.add(e.id);
  if (ids.size === 1) return [...ids][0];
  return null;
}

const REF_RE =
  /^\s*((?:(?:i{1,3}|\d)\s*[.-]?\s*)?[^\d\s:.,;\-–—][^\d:;]*?)\s*(?:[.\s]\s*)?(?:(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?)?\s*$/iu;

/**
 * Розбирає посилання. Повертає `null`, якщо рядок не схожий на посилання
 * (тоді він піде в пошук за словами). `chapter` відсутній, якщо вказано лише книгу.
 */
export function parseBibleReference(
  input: string,
  books?: NamedBook[],
): BibleReference | null {
  const text = input.trim();
  if (!text || text.length > 60 || /["«»“”]/.test(text)) return null;

  const m = REF_RE.exec(text);
  if (!m) return null;
  const [, rawBook, chapterRaw, verseRaw, verseToRaw] = m;

  const bookId = resolveBookId(rawBook, books);
  if (!bookId) return null;

  const info = BOOK_BY_ID.get(bookId);
  const chapter = chapterRaw ? Number(chapterRaw) : undefined;
  if (chapter !== undefined && chapter < 1) return null;

  // Без глави — лише якщо введено щонайменше 3 символи (щоб «ін» не відкривало книгу посеред набору слова).
  if (chapter === undefined) {
    const key = bookKey(rawBook);
    if (key.length < 3 && !/^\d/.test(key)) return null;
  }

  const verseFrom = verseRaw ? Number(verseRaw) : undefined;
  let verseTo = verseToRaw ? Number(verseToRaw) : undefined;
  if (verseFrom !== undefined && verseFrom < 1) return null;
  if (verseFrom !== undefined && verseTo !== undefined && verseTo < verseFrom) {
    verseTo = undefined;
  }

  // Однокнижні: «Юди 5» — це вірш 5 глави 1.
  if (
    info &&
    (info.id === "OBA" ||
      info.id === "PHM" ||
      info.id === "2JN" ||
      info.id === "3JN" ||
      info.id === "JUD") &&
    chapter !== undefined &&
    verseFrom === undefined
  ) {
    return { bookId, chapter: 1, verseFrom: chapter };
  }

  return { bookId, chapter, verseFrom, verseTo };
}

export function bookDisplayName(id: string, lang: string): string {
  const info = BOOK_BY_ID.get(id);
  if (!info) return id;
  return lang === "ua" ? info.names.ua : lang === "en" ? info.names.en : info.names.ru;
}
