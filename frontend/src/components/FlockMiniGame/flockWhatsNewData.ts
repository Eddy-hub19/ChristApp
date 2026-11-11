/**
 * Список новшеств «Отари». Для нового обновления достаточно ДОПИСАТЬ одну запись в конец `WHATS_NEW`
 * (version - целое, больше предыдущей). Тексты - одна строка на язык.
 */
export type WhatsNewIcon = "ruby" | "star" | "skins" | "freeze" | "boost" | "names" | "leaf" | "shield" | "trophy" | "scissors" | "starfall" | "eye" | "lava" | "fence" | "alpha" | "rain" | "pipe" | "wind" | "sound" | "lantern" | "jar" | "wings" | "emerald" | "quest" | "artifactShield";
export type WhatsNewLang = "ua" | "ru" | "en";

export interface WhatsNewItem {
  icon: WhatsNewIcon;
  text: Record<WhatsNewLang, string>;
}

export interface WhatsNewEntry {
  version: number;
  /** YYYY-MM-DD, только для справки. */
  date: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: 1,
    date: "2026-10-18",
    items: [
      {
        icon: "ruby",
        text: {
          ua: "Рубіни: займи 1-е місце з масою 1500 і отримай 10 рубінів",
          ru: "Рубины: займи 1-е место с массой 1500 и получи 10 рубинов",
          en: "Rubies: finish 1st with a mass of 1500 and earn 10 rubies",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Нові скіни за рубіни: 6 звичайних по 20",
          ru: "Новые скины за рубины: 6 обычных по 20",
          en: "New skins for rubies: 6 regular for 20",
        },
      },
      {
        icon: "freeze",
        text: {
          ua: "Заморожування тепер триває 4 секунди",
          ru: "Заморозка теперь длится 4 секунды",
          en: "Freeze now lasts 4 seconds",
        },
      },
      {
        icon: "boost",
        text: {
          ua: "Розгін на старті: перші 20 секунд овечка бігає швидше",
          ru: "Разгон на старте: первые 20 секунд овечка бегает быстрее",
          en: "Speed boost at spawn: your sheep runs faster for the first 20 seconds",
        },
      },
      {
        icon: "names",
        text: {
          ua: "Нові імена ботів",
          ru: "Новые имена ботов",
          en: "New bot names",
        },
      },
    ],
  },
  {
    version: 2,
    date: "2026-10-19",
    items: [
      {
        icon: "skins",
        text: {
          ua: "6 нових особливих скінів по 40 рубінів: кришталева, кактус, лавова, галактична, грозова і суші",
          ru: "6 новых особенных скинов по 40 рубинов: хрустальная, кактус, лавовая, галактическая, грозовая и суши",
          en: "6 new special skins for 40 rubies each: crystal, cactus, lava, galaxy, storm and sushi",
        },
      },
    ],
  },
  {
    version: 3,
    date: "2026-10-20",
    items: [
      {
        icon: "ruby",
        text: {
          ua: "Рубіни тепер за 1500 маси",
          ru: "Рубины теперь за 1500 массы",
          en: "Rubies are now earned at 1500 mass",
        },
      },
      {
        icon: "star",
        text: {
          ua: "Зорепад: коли хтось досягає 1000, з неба падають зірки",
          ru: "Зорепад: когда кто-то достигает 1000, с неба падают звёзды",
          en: "Starfall: when someone reaches 1000, stars fall from the sky",
        },
      },
      {
        icon: "leaf",
        text: {
          ua: "Більше їжі на карті",
          ru: "Больше еды на карте",
          en: "More food on the map",
        },
      },
    ],
  },
  {
    version: 4,
    date: "2026-10-20",
    items: [
      {
        icon: "scissors",
        text: {
          ua: "Ножиці: стрижуть навколо тебе всіх, у кого більше 500 маси, наполовину",
          ru: "Ножницы: стригут вокруг тебя всех, у кого больше 500 массы, наполовину",
          en: "Scissors: shear everyone around you with more than 500 mass in half",
        },
      },
    ],
  },
  {
    version: 5,
    date: "2026-10-20",
    items: [
      {
        icon: "skins",
        text: {
          ua: "2 нові скіни по 20 рубінів: Сердечна вівця й М'ятна вівця",
          ru: "2 новых скина по 20 рубинов: Сердечная овечка и Мятная овечка",
          en: "2 new skins for 20 rubies each: Heart Sheep and Mint Sheep",
        },
      },
    ],
  },
  {
    version: 6,
    date: "2026-10-22",
    items: [
      {
        icon: "skins",
        text: {
          ua: "Артефакти: 7 предметів поверх скіна по 80 рубінів. Шапка священника, корона, магніт, взуття, годинник, хрест і кадило дають невеликі бонуси",
          ru: "Артефакты: 7 предметов поверх скина по 80 рубинов. Шапка священника, корона, магнит, обувь, часы, крест и кадило дают небольшие бонусы",
          en: "Artifacts: 7 items worn over any skin for 80 rubies each. Priest's hat, crown, magnet, sandals, hourglass, cross and censer give small bonuses",
        },
      },
    ],
  },
  {
    version: 7,
    date: "2026-10-22",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Вожак: на арені з'являється сильний темний вовк із золотою короною. Він полює на великих, але його можна з'їсти!",
          ru: "Вожак: на арене появляется сильный тёмный волк с золотой короной. Он охотится на крупных, но его можно съесть!",
          en: "The Alpha: a strong dark wolf with a golden crown now roams the arena. It hunts big players, but it can be eaten!",
        },
      },
    ],
  },
  {
    version: 8,
    date: "2026-10-23",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Рекорди дня: у лобі з'явилась таблиця найбільших овечок за добу. Скидається опівночі за часом Києва",
          ru: "Рекорды дня: в лобби появилась таблица самых больших овечек за сутки. Сбрасывается в полночь по времени Киева",
          en: "Daily records: the lobby now shows the biggest sheep of the day. It resets at midnight Kyiv time",
        },
      },
      {
        icon: "ruby",
        text: {
          ua: "Будь №1 за день три дні поспіль (з масою від 1000) і отримай 20 рубінів",
          ru: "Будь №1 за день три дня подряд (с массой от 1000) и получи 20 рубинов",
          en: "Be #1 of the day three days in a row (mass 1000+) and earn 20 rubies",
        },
      },
    ],
  },
  {
    version: 9,
    date: "2026-10-23",
    items: [
      {
        icon: "names",
        text: {
          ua: "Швидкі фрази: кнопка 💬 зліва внизу (на ПК — клавіша T). Обери готову фразу, і над твоєю овечкою зʼявиться хмаринка. Чужі фрази можна сховати",
          ru: "Быстрые фразы: кнопка 💬 слева внизу (на ПК — клавиша T). Выбери готовую фразу, и над твоей овечкой появится облачко. Чужие фразы можно скрыть",
          en: "Quick phrases: the 💬 button at the bottom left (T key on desktop). Pick a ready-made phrase and a speech bubble appears over your sheep. You can hide others' phrases",
        },
      },
    ],
  },
  {
    version: 10,
    date: "2026-10-24",
    items: [
      {
        icon: "scissors",
        text: {
          ua: "Ножиці забирають 50% маси в усіх, у кого її понад 500, і віддають тому, хто їх узяв",
          ru: "Ножницы забирают 50% массы у всех, у кого её больше 500, и отдают тому, кто их взял",
          en: "Scissors take 50% of the mass of everyone above 500 and give it to whoever picked them up",
        },
      },
      {
        icon: "boost",
        text: {
          ua: "Магніт, прискорення й щит тепер діють по 10 секунд",
          ru: "Магнит, ускорение и щит теперь действуют по 10 секунд",
          en: "Magnet, speed and shield now last 10 seconds",
        },
      },
      {
        icon: "star",
        text: {
          ua: "Зорепад: кожна зірка дає 200 маси, а один гравець може запустити його не більше 2 разів за життя",
          ru: "Звездопад: каждая звезда даёт 200 массы, а один игрок может запустить его не больше 2 раз за жизнь",
          en: "Starfall: each star gives 200 mass, and one player can trigger it at most 2 times per life",
        },
      },
      {
        icon: "ruby",
        text: {
          ua: "Рубіни за 1-ше місце тепер від 3000 маси",
          ru: "Рубины за 1-е место теперь от 3000 массы",
          en: "Rubies for 1st place now require 3000 mass",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Оновлені артефакти по 100 рубінів: шапка священника, магніт і кадило працюють по-новому, а хрест дає друге життя",
          ru: "Обновлённые артефакты по 100 рубинов: шапка священника, магнит и кадило работают по-новому, а крест даёт вторую жизнь",
          en: "Updated artifacts for 100 rubies: the priest's hat, magnet and censer work differently, and the cross gives a second life",
        },
      },
      {
        icon: "shield",
        text: {
          ua: "«Овечка чекає» після вильоту тепер 30 секунд",
          ru: "«Овечка ждёт» после вылета теперь 30 секунд",
          en: "“Sheep is waiting” after a disconnect now lasts 30 seconds",
        },
      },
      {
        icon: "trophy",
        text: {
          ua: "Серія першого місця: у «Топ-10» біля гравця з серією з'явилась корона й кількість днів",
          ru: "Серия первого места: в «Топ-10» рядом с игроком с серией появилась корона и число дней",
          en: "1st-place streak: the Top 10 now shows a crown and the number of days next to the streak holder",
        },
      },
    ],
  },
  {
    version: 11,
    date: "2026-10-24",
    items: [
      {
        icon: "skins",
        text: {
          ua: "4 нові безкоштовні вовки: бурий, білий, рудий і блакитно-сірий. Безкоштовні скіни тепер у трьох рядах: овечки, вовки й решта",
          ru: "4 новых бесплатных волка: бурый, белый, рыжий и сине-серый. Бесплатные скины теперь в трёх рядах: овечки, волки и остальные",
          en: "4 new free wolves: brown, white, red and blue-gray. Free skins now sit in three rows: sheep, wolves and the rest",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Новий ряд преміум-скінів з анімацією по 60 рубінів: вівця-фенікс, місячна, квітуча, новорічна, вівця-метелик і грозовий баран",
          ru: "Новый ряд премиум-скинов с анимацией по 60 рубинов: овца-феникс, лунная, цветущая, новогодняя, овечка-бабочка и грозовый баран",
          en: "A new row of animated premium skins for 60 rubies each: phoenix, moon, blooming, New Year, butterfly sheep and thunder ram",
        },
      },
      {
        icon: "star",
        text: {
          ua: "Веселкова вівця: уся вовна тепер переливається м'якими кольорами веселки",
          ru: "Радужная овечка: вся шерсть теперь переливается мягкими цветами радуги",
          en: "Rainbow Sheep: all of its wool now shimmers in soft rainbow colors",
        },
      },
    ],
  },
  {
    version: 12,
    date: "2026-10-24",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Вожак тепер завжди більший за лідера: з'являється з масою лідера ×1,2, а коли з'їдає лідера, усі бачать повідомлення",
          ru: "Вожак теперь всегда больше лидера: появляется с массой лидера ×1,2, а когда съедает лидера, все видят сообщение",
          en: "The Alpha is now always bigger than the leader: it appears at the leader's mass ×1.2, and when it eats the leader everyone sees a message",
        },
      },
      {
        icon: "shield",
        text: {
          ua: "Розумніші боти: випереджають рух цілі, тікають у відкритий простір чи до куща, не лізуть до цілей під охороною і діляться лише коли певні, що наздоженуть",
          ru: "Умнее боты: упреждают движение цели, убегают в открытое место или к кусту, не лезут к целям под охраной и делятся, только когда уверены, что догонят",
          en: "Smarter bots: they lead their targets, flee to open space or a bush, avoid guarded targets and split only when sure to catch",
        },
      },
    ],
  },
  {
    version: 13,
    date: "2026-10-24",
    items: [
      {
        icon: "eye",
        text: {
          ua: "Новий бонус «Орлиний зір»: 10 секунд камера віддаляється, і ти бачиш більше карти",
          ru: "Новый бонус «Орлиный взор»: 10 секунд камера отдаляется, и ты видишь больше карты",
          en: "New bonus “Eagle eye”: for 10 seconds the camera pulls back and you see more of the map",
        },
      },
      {
        icon: "fence",
        text: {
          ua: "Арену обнесено загорожею: дерев'яною, сніговою або з сухого дерева, залежно від карти. На мінікарті межа тепер у рамці",
          ru: "Арена обнесена оградой: деревянной, снежной или из сухого дерева, в зависимости от карты. На миникарте граница теперь в рамке",
          en: "The arena now has a fence: wooden, snowy or dry-wood depending on the map. The minimap border is framed",
        },
      },
      {
        icon: "starfall",
        text: {
          ua: "Нові зорі «Зорепаду»: кожна своєї форми, з золотим хвостом і світлим кільцем-міткою на землі",
          ru: "Новые звёзды «Зорепада»: каждая своей формы, с золотым хвостом и светлым кольцом-меткой на земле",
          en: "New Starfall stars: each its own shape, with a golden tail and a bright ring marking where it lands",
        },
      },
    ],
  },
  {
    version: 14,
    date: "2026-10-24",
    items: [
      {
        icon: "lava",
        text: {
          ua: "Нова карта «Вулкан»: темна земля з жаром, обгорілі кущі й річка лави з мостами. Хто потрапив у лаву, згорає!",
          ru: "Новая карта «Вулкан»: тёмная земля с жаром, обгорелые кусты и река лавы с мостами. Кто попал в лаву, сгорает!",
          en: "New map “Volcano”: dark ground with embers, charred bushes and a lava river with bridges. Fall into the lava and you burn!",
        },
      },
      {
        icon: "leaf",
        text: {
          ua: "Сніжна карта справді вкрита снігом, а на осінній замість трави тепер золоте листя",
          ru: "Снежная карта теперь по-настоящему покрыта снегом, а на осенней вместо травы золотая листва",
          en: "The snow map is now really covered in snow, and the autumn map has golden leaves instead of grass",
        },
      },
    ],
  },
  {
    version: 15,
    date: "2026-10-24",
    items: [
      {
        icon: "names",
        text: {
          ua: "Швидкі фрази без емодзі, ще 4 нові («Привіт», «Не їж мене», «Давай разом», «Вибач») і два ряди в сітці",
          ru: "Быстрые фразы без эмодзи, ещё 4 новые («Привет», «Не ешь меня», «Давай вместе», «Прости») и два ряда в сетке",
          en: "Quick phrases without emoji, 4 new ones (“Hi”, “Don't eat me”, “Let's team up”, “Sorry”) and two more rows in the grid",
        },
      },
      {
        icon: "names",
        text: {
          ua: "Можна написати своє повідомлення в хмаринку: до 40 символів, не частіше 1 разу за 5 секунд. Лайка й посилання відсікаються",
          ru: "Можно написать своё сообщение в облачко: до 40 символов, не чаще 1 раза в 5 секунд. Брань и ссылки отсекаются",
          en: "You can write your own message in the bubble: up to 40 characters, once per 5 seconds. Swearing and links are blocked",
        },
      },
    ],
  },
  {
    version: 16,
    date: "2026-10-29",
    items: [
      {
        icon: "boost",
        text: {
          ua: "«Прискорення»: утримуй кнопку (на ПК — Shift) — швидкість +25%, але щосекунди згорає 1,5% маси. Працює від маси 40, нижче стартової не спалює",
          ru: "«Ускорение»: удерживай кнопку (на ПК — Shift) — скорость +25%, но каждую секунду сгорает 1,5% массы. Работает от массы 40, ниже стартовой не сжигает",
          en: "Sprint: hold the button (Shift on desktop) for +25% speed, but 1.5% of your mass burns every second. Works from 40 mass and never burns below the starting mass",
        },
      },
      {
        icon: "leaf",
        text: {
          ua: "На осінній карті «Гай» листочки-їжа тепер червоні й бордові: їх краще видно на золотій землі",
          ru: "На осенней карте «Гай» листочки-еда теперь красные и бордовые: их лучше видно на золотой земле",
          en: "On the autumn “Grove” map the leaf food is now red and burgundy, easier to spot on the golden ground",
        },
      },
      {
        icon: "rain",
        text: {
          ua: "Дощ на карті «Гай»: раз на 2–4 хв на 40–60 с, з'являється 8–12 калюж, що уповільнюють на 20% і підсихають ще 20 с після дощу",
          ru: "Дождь на карте «Гай»: раз в 2–4 мин на 40–60 с, появляется 8–12 луж, которые замедляют на 20% и подсыхают ещё 20 с после дождя",
          en: "Rain on the “Grove” map: every 2–4 min for 40–60 s, 8–12 puddles appear that slow you by 20% and dry out for 20 s after the rain",
        },
      },
    ],
  },
  {
    version: 17,
    date: "2026-10-30",
    items: [
      {
        icon: "lava",
        text: {
          ua: "На карті «Вулкан» з'явилась орда «Лавових чудовиськ» (6–10): вони швидші на 20%, нападають на найближчого, але їх можна з'їсти. Новачків вони не чіпають",
          ru: "На карте «Вулкан» появилась орда «Лавовых чудовищ» (6–10): они быстрее на 20%, нападают на ближайшего, но их можно съесть. Новичков они не трогают",
          en: "A horde of “Lava monsters” (6–10) now roams the “Volcano” map: 20% faster, they hunt the nearest player, but you can eat them. Newcomers are safe",
        },
      },
      {
        icon: "trophy",
        text: {
          ua: "Новий режим «Звужуване коло» (лобі → «Режими»): карта стискається, поза колом тане маса, переможець отримує рубіни в межах добового ліміту",
          ru: "Новый режим «Сужающийся круг» (лобби → «Режимы»): карта сжимается, вне круга тает масса, победитель получает рубины в пределах дневного лимита",
          en: "New “Shrinking circle” mode (lobby → “Modes”): the map shrinks, mass melts outside the circle, and the winner earns rubies within the daily limit",
        },
      },
    ],
  },
  {
    version: 18,
    date: "2026-11-02",
    items: [
      {
        icon: "wind",
        text: {
          ua: "Подія «Вітер» (Луг, Гай, Мороз): за 3 с з'являється попередження «Вітер!» зі стрілкою, потім 15–20 с усіх зносить в один бік. На «Вулкані» вітру немає",
          ru: "Событие «Ветер» (Луг, Роща, Мороз): за 3 с появляется предупреждение «Ветер!» со стрелкой, потом 15–20 с всех сносит в одну сторону. На «Вулкане» ветра нет",
          en: "New “Wind” event (Meadow, Grove, Frost): a “Wind!” warning with an arrow shows 3 s ahead, then for 15–20 s everyone drifts one way. There is no wind on the “Volcano”",
        },
      },
      {
        icon: "pipe",
        text: {
          ua: "Новий рідкісний бонус «Сопілка пастуха»: 10 с притягує до тебе менших овечок поруч, але ті, хто активно тікає, можуть вирватись",
          ru: "Новый редкий бонус «Свирель пастуха»: 10 с притягивает к тебе меньших овечек рядом, но те, кто активно убегает, могут вырваться",
          en: "New rare “Shepherd's pipe” bonus: for 10 s it pulls smaller sheep nearby towards you, but those who run hard can break free",
        },
      },
      {
        icon: "leaf",
        text: {
          ua: "Карти змінюються: нова арена бере іншу карту, ніж попередня. На кожній карті свій вигляд землі, їжі й декору; на вході на 3 с показується назва карти",
          ru: "Карты меняются: новая арена берёт другую карту, чем предыдущая. У каждой карты свой вид земли, еды и декора; при входе на 3 с показывается название карты",
          en: "Maps now rotate: a new arena never repeats the previous map. Each map has its own ground, food and decor, and the map name shows for 3 s when you enter",
        },
      },
    ],
  },
  {
    version: 19,
    date: "2026-11-05",
    items: [
      {
        icon: "skins",
        text: {
          ua: "«Лавова овечка» знову в магазині за ціною особливих (хто купив раніше, лишає її). Нові особливі скіни: «Медова овечка» і «Небесна овечка». Вожак тепер виглядає по-різному на кожній карті",
          ru: "«Лавовая овечка» снова в магазине по цене особых (кто купил раньше, сохраняет её). Новые особые скины: «Медовая овечка» и «Небесная овечка». Вожак теперь выглядит по-разному на каждой карте",
          en: "The “Lava sheep” is back in the shop at the special-skin price (earlier buyers keep it). New special skins: “Honey sheep” and “Sky sheep”. The Alpha now looks different on every map",
        },
      },
      {
        icon: "trophy",
        text: {
          ua: "Серія першого місця: за 1-й день поспіль 10 рубінів, за 2-й 20, за 3-й 30, після чого серія починається знову з 10",
          ru: "Серия первого места: за 1-й день подряд 10 рубинов, за 2-й 20, за 3-й 30, после чего серия начинается заново с 10",
          en: "First-place streak: 10 rubies for the 1st day in a row, 20 for the 2nd, 30 for the 3rd, then the streak starts over from 10",
        },
      },
      {
        icon: "starfall",
        text: {
          ua: "«Зорепад» починається від маси 1500 і не частіше одного разу за життя запускача (воскресіння дає нове життя)",
          ru: "«Зорепад» начинается от массы 1500 и не чаще одного раза за жизнь запускающего (воскрешение даёт новую жизнь)",
          en: "Starfall now triggers from 1500 mass, once per life of the player who starts it (a revive counts as a new life)",
        },
      },
      {
        icon: "shield",
        text: {
          ua: "Режим «Звужуване коло» повільніший: усі фази довші приблизно в 1,6 раза, а маса поза колом тане на 30% м'якше",
          ru: "Режим «Сужающийся круг» медленнее: все фазы длиннее примерно в 1,6 раза, а масса вне круга тает на 30% мягче",
          en: "“Shrinking circle” is slower: every phase is about 1.6x longer and mass outside the circle melts 30% more gently",
        },
      },
    ],
  },
  {
    version: 20,
    date: "2026-10-30",
    items: [
      {
        icon: "sound",
        text: {
          ua: "У «Отарі» зʼявились звуки: поїдання, бонуси, події арени. Вимкнути чи зробити тихіше можна кнопкою з динаміком",
          ru: "В «Отаре» появились звуки: поедание, бонусы, события арены. Выключить или сделать тише можно кнопкой с динамиком",
          en: "Flock now has sounds: eating, bonuses and arena events. Mute or turn them down with the speaker button",
        },
      },
    ],
  },
  {
    version: 21,
    date: "2026-10-31",
    items: [
      {
        icon: "ruby",
        text: {
          ua: "Нові ціни: звичайні скіни 50, особливі 150, преміум 200, артефакти 350 рубінів. Куплене лишається, доплат немає",
          ru: "Новые цены: обычные скины 50, особенные 150, премиум 200, артефакты 350 рубинов. Купленное остаётся, доплат нет",
          en: "New prices: regular skins 50, special 150, premium 200, artifacts 350 rubies. What you own stays yours, no extra charges",
        },
      },
      {
        icon: "trophy",
        text: {
          ua: "Збери всі преміум-скіни, що є в продажу, і один раз отримай 300 рубінів",
          ru: "Собери все премиум-скины, что есть в продаже, и один раз получи 300 рубинов",
          en: "Collect every premium skin on sale and get 300 rubies once",
        },
      },
      {
        icon: "star",
        text: {
          ua: "Особливі скіни тепер дають невеликі бонуси: швидкість, радіус підбору їжі, повільніший розпад маси та інші. Бонус видно в лобі біля скіна",
          ru: "Особенные скины теперь дают небольшие бонусы: скорость, радиус подбора еды, более медленный распад массы и другие. Бонус виден в лобби у скина",
          en: "Special skins now give small bonuses: speed, food pickup radius, slower mass decay and more. The bonus is shown in the lobby next to the skin",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Чотири нові скіни: «Ягідна», «Зимова» й «Какао-вівця» (особливі) та анімована «Вівця-комета» (преміум)",
          ru: "Четыре новых скина: «Ягодная», «Зимняя» и «Какао-овца» (особенные) и анимированная «Овца-комета» (премиум)",
          en: "Four new skins: Berry, Winter and Cocoa sheep (special) and the animated Comet sheep (premium)",
        },
      },
    ],
  },
  {
    version: 22,
    date: "2026-11-04",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Новий командний режим «Замки» (лобі → «Режими»): Вівці проти Вовків на новій карті «Ліс і озеро». Вкради камінь із чужого замку, принеси на свою базу — кілька доставок руйнують замок. Переможцям — рубіни. Усі числа — у вікні «i»",
          ru: "Новый командный режим «Замки» (лобби → «Режимы»): Овцы против Волков на новой карте «Лес и озеро». Укради камень из чужого замка, принеси на свою базу — несколько доставок разрушают замок. Победителям — рубины. Все числа — в окне «i»",
          en: "New team mode “Castles” (lobby → “Modes”): Sheep versus Wolves on the new “Forest and lake” map. Steal a stone from the enemy castle and bring it to your base — a few deliveries destroy the castle. Winners earn rubies. All numbers are in the “i” window",
        },
      },
    ],
  },
  {
    version: 23,
    date: "2026-11-05",
    items: [
      {
        icon: "lantern",
        text: {
          ua: "Нова карта «Ніч» (з 20:00 до 06:00 за Києвом): скрізь темно, видно лише в радіусі світла навколо тебе. Їжа розширює світло, «Зорепад» видно всім. Нові рідкісні бонуси: «Ліхтарик» і «Пляшка зі світлячками»",
          ru: "Новая карта «Ночь» (с 20:00 до 06:00 по Киеву): везде темно, видно только в радиусе света вокруг тебя. Еда расширяет свет, «Звездопад» видно всем. Новые редкие бонусы: «Фонарик» и «Банка со светлячками»",
          en: "New “Night” map (20:00–06:00 Kyiv time): it is dark everywhere and you only see inside the light radius around you. Food widens the light, Starfall is visible to all. New rare bonuses: the Flashlight and the Jar of fireflies",
        },
      },
      {
        icon: "jar",
        text: {
          ua: "«Пляшка зі світлячками» збільшує радіус світла слабше за «Ліхтарик» і не складається з ним; числа — у вікні «i»",
          ru: "«Банка со светлячками» увеличивает радиус света слабее «Фонарика» и не складывается с ним; числа — в окне «i»",
          en: "The Jar of fireflies widens the light less than the Flashlight and does not stack with it; numbers are in the “i” window",
        },
      },
    ],
  },
  {
    version: 24,
    date: "2026-11-04",
    items: [
      {
        icon: "names",
        text: {
          ua: "Стрічка «Чат» зліва під індикаторами: усі фрази й тексти гравців арени (навіть далеких), згортається, запам'ятовує стан",
          ru: "Лента «Чат» слева под индикаторами: все фразы и тексты игроков арены (даже далёких), сворачивается, запоминает состояние",
          en: "A “Chat” feed at the left under the indicators: every phrase and text from players in the arena (even far away), collapsible and remembers its state",
        },
      },
      {
        icon: "star",
        text: {
          ua: "Плашка маси більше не обрізає число й місце в таблиці",
          ru: "Плашка массы больше не обрезает число и место в таблице",
          en: "The mass tile no longer clips the number and the rank",
        },
      },
    ],
  },
  {
    version: 25,
    date: "2026-11-06",
    items: [
      {
        icon: "wings",
        text: {
          ua: "Нова карта «Небо»: пухнасті хмари пливуть над порожнечею. Не зійди з хмаринки: хто довго над просвітом, падає. Їжа й кущі лише на хмарах, вітру й дощу немає",
          ru: "Новая карта «Небо»: пушистые облака плывут над пустотой. Не сойди с облачка: кто долго над просветом, падает. Еда и кусты только на облаках, ветра и дождя нет",
          en: "New “Sky” map: fluffy clouds drift over the void. Don't step off the cloud: stay over a gap too long and you fall. Food and bushes only on clouds, no wind or rain",
        },
      },
      {
        icon: "leaf",
        text: {
          ua: "«Веселка» на «Небі»: цінна їжа, що росте лише на хмарах, дає масу як кілька квіток і короткий заряд прискорення",
          ru: "«Радуга» на «Небе»: ценная еда, которая растёт только на облаках, даёт массу как несколько цветков и короткий заряд ускорения",
          en: "The Rainbow on “Sky”: valuable food that grows only on clouds, gives mass like several flowers and a short speed charge",
        },
      },
      {
        icon: "wings",
        text: {
          ua: "Бонус «Крильця» (рідкісний, лише на «Небі»): 15 с летиш над просвітами, не падаєш і біжиш трохи швидше. Останні 2 с крильця мигають",
          ru: "Бонус «Крылышки» (редкий, только на «Небе»): 15 с летишь над просветами, не падаешь и бежишь чуть быстрее. Последние 2 с крылышки мигают",
          en: "The Wings bonus (rare, “Sky” only): for 15 s you fly over gaps without falling and run a bit faster. The wings blink for the last 2 s",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Скоро: нова категорія скінів «Легендарні» (12 скінів)",
          ru: "Скоро: новая категория скинов «Легендарные» (12 скинов)",
          en: "Coming soon: a new “Legendary” skin category (12 skins)",
        },
      },
      {
        icon: "names",
        text: {
          ua: "У лобі два ряди овечок по шість; вовки лишилися ботам і режиму «Замки»",
          ru: "В лобби два ряда овечек по шесть; волки остались ботам и режиму «Замки»",
          en: "The lobby now has two rows of six sheep; wolves stay with bots and the Castles mode",
        },
      },
    ],
  },
  {
    version: 26,
    date: "2026-11-06",
    items: [
      {
        icon: "eye",
        text: {
          ua: "Показ смерті: тепер видно, як тебе з'їли, і хто це зробив (з підписом, Вожак - червоним), перш ніж з'явиться карточка підсумків. Нажми, щоб пропустити",
          ru: "Показ смерти: теперь видно, как тебя съели и кто это сделал (с подписью, Вожак - красным), прежде чем появится карточка итогов. Нажми, чтобы пропустить",
          en: "A death replay: you now see how you were eaten and by whom (with a caption, the Alpha in red) before the results card appears. Tap to skip",
        },
      },
    ],
  },
  {
    version: 27,
    date: "2026-11-10",
    items: [
      {
        icon: "ruby",
        text: {
          ua: "Нова економіка рубінів: 1-ше місце — 5, Вожак — 3 (до 15 за добу), «Замки» — 20 (до 3 перемог за добу, проти ботів лише 3 за весь час), серія днів 5/10/15, колекція преміум — 150. Усі ігрові джерела разом дають не більше 100 рубінів за добу. Уже зароблене й куплене не змінюється",
          ru: "Новая экономика рубинов: 1-е место — 5, Вожак — 3 (до 15 в сутки), «Замки» — 20 (до 3 побед в сутки, против ботов только 3 за всё время), серия дней 5/10/15, коллекция премиум — 150. Все игровые источники вместе дают не больше 100 рубинов в сутки. Уже заработанное и купленное не меняется",
          en: "New ruby economy: 1st place — 5, the Alpha — 3 (up to 15 a day), Castles — 20 (up to 3 wins a day, only 3 ever against bots), day streak 5/10/15, premium collection — 150. All in-game sources together pay at most 100 rubies a day. What you already earned and bought is unchanged",
        },
      },
    ],
  },
  {
    version: 28,
    date: "2026-11-11",
    items: [
      {
        icon: "emerald",
        text: {
          ua: "Нова валюта — смарагди. Їх дуже важко здобути: видаються за складні щоденні завдання, накопичити можна не більше 200. Передавати іншим гравцям не можна. Баланс — поруч із рубінами в лобі",
          ru: "Новая валюта — изумруды. Их очень трудно добыть: выдаются за сложные ежедневные задания, накопить можно не больше 200. Передавать другим игрокам нельзя. Баланс — рядом с рубинами в лобби",
          en: "A new currency: emeralds. They are very hard to get: handed out for the hard daily quests, and you can hold at most 200. They can't be given to other players. Your balance sits next to rubies in the lobby",
        },
      },
      {
        icon: "quest",
        text: {
          ua: "Щоденні завдання: три на день (два прості за рубіни й одне складне за смарагди). Кнопка зі сувоєм поруч із «i». Скидаються опівночі за Києвом, невзяте не копичиться. Нагороду забираєш сам кнопкою «Забрати»",
          ru: "Ежедневные задания: три в день (два простых за рубины и одно сложное за изумруды). Кнопка со свитком рядом с «i». Сбрасываются в полночь по Киеву, невзятое не копится. Награду забираешь сам кнопкой «Забрати»",
          en: "Daily quests: three a day (two easy ones for rubies and one hard one for emeralds). The scroll button next to “i”. They reset at Kyiv midnight and unclaimed rewards don't pile up. Press Claim to collect",
        },
      },
      {
        icon: "ruby",
        text: {
          ua: "Ігрові джерела рубінів разом тепер дають до 100 рубінів за добу. Нагороди за щоденні завдання сюди не входять",
          ru: "Игровые источники рубинов вместе теперь дают до 100 рубинов в сутки. Награды за ежедневные задания сюда не входят",
          en: "All in-game ruby sources together now pay up to 100 rubies a day. Daily quest rewards are not counted in it",
        },
      },
      {
        icon: "artifactShield",
        text: {
          ua: "Новий артефакт «Щит»: колючі кущі й ялинки не рвуть твою овечку. Ховатися під кущем, як і раніше, може лише менша за нього. Купується за смарагди, за рубіни — ні",
          ru: "Новый артефакт «Щит»: колючие кусты и ёлки не рвут твою овечку. Прятаться под кустом, как и раньше, может только меньшая за него. Покупается за изумруды, за рубины — нет",
          en: "A new artifact, the Shield: thorn bushes and firs no longer tear your sheep apart. Only a cell smaller than the bush can still hide under it. Bought with emeralds, not rubies",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "«Легендарні» скіни купуватимуться лише за смарагди, не за рубіни. Поки що вони в лобі позначені «Скоро»",
          ru: "«Легендарные» скины будут покупаться только за изумруды, не за рубины. Пока что они в лобби помечены «Скоро»",
          en: "Legendary skins will be bought with emeralds only, not rubies. For now they are marked “Soon” in the lobby",
        },
      },
    ],
  },
  {
    version: 29,
    date: "2026-11-11",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Нова карта «Арена»: колізей, де всі овечки — одна команда. Вони не їдять одна одну й разом б'ються з хвилями вовків, а потім із тигром-босом",
          ru: "Новая карта «Арена»: колизей, где все овечки — одна команда. Они не едят друг друга и вместе бьются с волнами волков, а потом с тигром-боссом",
          en: "A new map, the Colosseum: every sheep is on the same team. They don't eat each other and fight waves of wolves together, then the Tiger boss",
        },
      },
      {
        icon: "boost",
        text: {
          ua: "Тигра не з'їсти: збирай стріли з землі й стріляй клавішею F (на телефоні — кнопка «Стріла»). Достатньо кількох влучань, щоб отримати приз",
          ru: "Тигра не съесть: собирай стрелы с земли и стреляй клавишей F (на телефоне — кнопка «Стріла»). Достаточно нескольких попаданий, чтобы получить приз",
          en: "The Tiger can't be eaten: pick up arrows from the ground and shoot with F (the Arrow button on phones). A few hits are enough to earn a prize",
        },
      },
      {
        icon: "ruby",
        text: {
          ua: "За перемогу над тигром — рубіни й шанс на смарагд (є ліміт на добу). Раунд без перемоги за ліміт часу скидається без нагород",
          ru: "За победу над тигром — рубины и изумруд (есть лимит в сутки). Раунд без победы по лимиту времени сбрасывается без наград",
          en: "Defeating the Tiger pays rubies and an emerald (with a daily limit). A round without a win resets on a time limit with no rewards",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Перемоги над тигром ведуть вічний рахунок: за певну кількість перемог видається один із «Легендарних» скінів другого ряду. Прогрес видно в лобі й у вікні «i»",
          ru: "Победы над тигром ведут вечный счёт: за определённое число побед выдаётся один из «Легендарных» скинов второго ряда. Прогресс виден в лобби и в окне «i»",
          en: "Tiger wins are counted forever: a set number of wins grants one of the second-row Legendary skins. Your progress is shown in the lobby and in the “i” window",
        },
      },
    ],
  },
];

/** Короткие правила для тех, кто заходит в «Отару» впервые. */
export const WELCOME_ITEMS: WhatsNewItem[] = [
  {
    icon: "leaf",
    text: {
      ua: "Їж траву і тих, хто менший за тебе, щоб рости",
      ru: "Ешь траву и тех, кто меньше тебя, чтобы расти",
      en: "Eat grass and anyone smaller than you to grow",
    },
  },
  {
    icon: "shield",
    text: {
      ua: "Не дай себе з'їсти тим, хто більший",
      ru: "Не дай себя съесть тем, кто больше",
      en: "Don't let bigger players eat you",
    },
  },
  {
    icon: "trophy",
    text: {
      ua: "Займи 1-ше місце і отримай рубіни",
      ru: "Займи 1-е место и получи рубины",
      en: "Take 1st place and earn rubies",
    },
  },
];
