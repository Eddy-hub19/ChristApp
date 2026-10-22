/**
 * Тексты экрана «Про гру» (кнопка «i» в лобби). Новый бонус/событие/вид еды = ДОПИСАТЬ одну запись в нужную секцию.
 * Числа не вписываются руками: в тексте `{name}`, а `params.name` указывает путь в flock.config.ts (config.game из /flock/me)
 * и формат: sec - мс в секунды, pct - доля в проценты, x - множитель, num - как есть.
 * icon: имя иконки из набора игры (как в «Що нового»), `bonus:<вид>` - иконка бонуса с карты, `artifact:<номер>` - артефакт.
 */
import type { WhatsNewIcon } from "./flockWhatsNewData";

export type InfoLang = "ua" | "ru" | "en";
export type L = Record<InfoLang, string>;
export type ParamFormat = "sec" | "pct" | "x" | "num";

export interface InfoParam {
  path: string;
  as?: ParamFormat;
}

export interface InfoEntry {
  id: string;
  icon: WhatsNewIcon | `bonus:${string}` | `artifact:${number}`;
  title: L;
  text: L;
  params?: Record<string, InfoParam>;
}

export interface InfoSection {
  id: string;
  title: L;
  /** Короткое вступление над записями (тоже с параметрами). */
  intro?: Pick<InfoEntry, "text" | "params">;
  /** Секция артефактов берёт названия и описания из переводов flock.artifacts.items. */
  artifacts?: boolean;
  entries: InfoEntry[];
}

const sec = (path: string): InfoParam => ({ path, as: "sec" });
const pct = (path: string): InfoParam => ({ path, as: "pct" });
const num = (path: string): InfoParam => ({ path });

export const INFO_SECTIONS: InfoSection[] = [
  {
    id: "how",
    title: { ua: "Як грати", ru: "Как играть", en: "How to play" },
    entries: [
      {
        id: "eat",
        icon: "leaf",
        title: { ua: "Рости", ru: "Расти", en: "Grow" },
        text: {
          ua: "Їж траву й тих, хто менший за тебе, щоб рости. З'їсти можна того, хто принаймні у {ratio} раза менший. Не дай собі потрапити до більшого.",
          ru: "Ешь траву и тех, кто меньше тебя, чтобы расти. Съесть можно того, кто минимум в {ratio} раза меньше. Не дай съесть себя тому, кто больше.",
          en: "Eat grass and anyone smaller than you to grow. You can eat someone at least {ratio}x smaller. Don't let a bigger player catch you.",
        },
        params: { ratio: num("eatRatio") },
      },
      {
        id: "controls",
        icon: "boost",
        title: { ua: "Керування", ru: "Управление", en: "Controls" },
        text: {
          ua: "На ПК овечка біжить за мишею, на телефоні керуй джойстиком. «Розділитися» ділить овечку навпіл для різкого ривка; частини зливаються назад через {merge} с. «Кинути» викидає шматок маси ({throw}).",
          ru: "На ПК овечка бежит за мышью, на телефоне управляй джойстиком. «Разделиться» делит овечку пополам для рывка; части сливаются обратно через {merge} с. «Бросить» выбрасывает кусок массы ({throw}).",
          en: "On desktop your sheep follows the mouse; on phone use the joystick. “Split” halves your sheep for a quick dash; the parts merge back after {merge} s. “Throw” tosses a chunk of mass ({throw}).",
        },
        params: { merge: sec("mergeDelayMs"), throw: num("throwMass") },
      },
      {
        id: "phrases",
        icon: "names",
        title: { ua: "Швидкі фрази", ru: "Быстрые фразы", en: "Quick phrases" },
        text: {
          ua: "Кнопка 💬 зліва внизу (на ПК ще клавіша T) відкриває 8 готових фраз: обирай і над твоєю овечкою зʼявиться хмаринка. Її бачать ті, хто бачить тебе, вона висить до {sec} с і тане наприкінці. Не частіше однієї фрази за {cd} с. Чужі фрази можна сховати перемикачем у панелі.",
          ru: "Кнопка 💬 слева внизу (на ПК ещё клавиша T) открывает 8 готовых фраз: выбери, и над твоей овечкой появится облачко. Его видят те, кто видит тебя, оно висит до {sec} с и тает в конце. Не чаще одной фразы за {cd} с. Чужие фразы можно скрыть переключателем в панели.",
          en: "The 💬 button at the bottom left (or the T key on desktop) opens 8 ready-made phrases: pick one and a speech bubble appears over your sheep. Everyone who can see you sees it; it stays up to {sec} s and fades at the end. One phrase per {cd} s at most. You can hide others' phrases with the switch in the panel.",
        },
        params: { sec: sec("phrases.durationMs"), cd: sec("phrases.cooldownMs") },
      },
    ],
  },
  {
    id: "rubies",
    title: { ua: "Рубіни", ru: "Рубины", en: "Rubies" },
    entries: [
      {
        id: "earn",
        icon: "ruby",
        title: { ua: "Як отримати", ru: "Как получить", en: "How to earn" },
        text: {
          ua: "Займи 1-ше місце в «Топ-10» з масою від {mass}: {reward} рубінів, один раз за життя. Не більше {limit} рубінів на арені за добу (за часом Києва). Вожак і боти не рахуються. Ще: {entry} рубінів за перший вхід у гру й {boss} за перемогу над Вожаком.",
          ru: "Займи 1-е место в «Топ-10» с массой от {mass}: {reward} рубинов, один раз за жизнь. Не больше {limit} рубинов на арене в сутки (по времени Киева). Вожак и боты не считаются. Ещё: {entry} рубинов за первый вход в игру и {boss} за победу над Вожаком.",
          en: "Finish 1st in the Top 10 with a mass of {mass}+: {reward} rubies, once per life. Up to {limit} rubies a day on the arena (Kyiv time). The Alpha and bots don't count. Also: {entry} rubies for your first visit and {boss} for defeating the Alpha.",
        },
        params: {
          mass: num("rubies.top1MassThreshold"),
          reward: num("rubies.top1Reward"),
          limit: num("rubies.dailyLimit"),
          entry: num("rubies.entryBonus"),
          boss: num("rubies.bossKillReward"),
        },
      },
      {
        id: "daily",
        icon: "trophy",
        title: { ua: "Рекорди дня й серія", ru: "Рекорды дня и серия", en: "Daily records & streak" },
        text: {
          ua: "У лобі — таблиця «Рекорди дня»: топ-{top} за найбільшою масою за добу (за часом Києва), скидається опівночі. Боти й Вожак не рахуються. Хто {days} дні поспіль посідає 1-ше місце за день (з масою від {mass}), отримує {reward} рубінів — поза добовим лімітом арени. Після нагороди серія починається заново; якщо наступного дня 1-ше місце візьме хтось інший, серія обривається.",
          ru: "В лобби — таблица «Рекорды дня»: топ-{top} по наибольшей массе за сутки (по времени Киева), сбрасывается в полночь. Боты и Вожак не считаются. Кто {days} дня подряд занимает 1-е место за день (с массой от {mass}), получает {reward} рубинов — вне суточного лимита арены. После награды серия начинается заново; если на следующий день 1-е место займёт кто-то другой, серия обрывается.",
          en: "The lobby shows a “Daily records” table: top {top} by biggest mass of the day (Kyiv time), reset at midnight. Bots and the Alpha don't count. Finish 1st of the day (with a mass of {mass}+) {days} days in a row to earn {reward} rubies — outside the arena's daily limit. After the reward the streak starts over; if someone else takes 1st the next day, the streak breaks.",
        },
        params: { top: num("dailyRecords.topSize"), days: num("dailyRecords.streakDays"), mass: num("dailyRecords.minMass"), reward: num("dailyRecords.streakReward") },
      },
      {
        id: "spend",
        icon: "skins",
        title: { ua: "На що витратити", ru: "На что потратить", en: "What to spend on" },
        text: {
          ua: "Скіни: звичайні — {skin}, преміум — {premium}, особливі — {special} рубінів. Артефакти — по {artifact} рубінів.",
          ru: "Скины: обычные — {skin}, премиум — {premium}, особенные — {special} рубинов. Артефакты — по {artifact} рубинов.",
          en: "Skins: regular {skin}, premium {premium}, special {special} rubies. Artifacts cost {artifact} rubies each.",
        },
        params: {
          skin: num("rubies.skinPrice"),
          premium: num("rubies.premiumSkinPrice"),
          special: num("rubies.specialSkinPrice"),
          artifact: num("artifactPrice"),
        },
      },
    ],
  },
  {
    id: "boss",
    title: { ua: "Вожак", ru: "Вожак", en: "The Alpha" },
    entries: [
      {
        id: "who",
        icon: "trophy",
        title: { ua: "Хто це", ru: "Кто это", en: "Who is it" },
        text: {
          ua: "Сильний темний вовк із золотою короною. Починає з масою {start}, росте до {max}, полює на великих гравців, заганяє їх до краю карти, ховається в кущах і тікає від груп.",
          ru: "Сильный тёмный волк с золотой короной. Начинает с массой {start}, растёт до {max}, охотится на крупных игроков, загоняет их к краю карты, прячется в кустах и убегает от групп.",
          en: "A strong dark wolf with a golden crown. It starts at {start} mass, grows up to {max}, hunts big players, herds them to the edge of the map, hides in bushes and runs from groups.",
        },
        params: { start: num("boss.startMass"), max: num("boss.maxMass") },
      },
      {
        id: "spawn",
        icon: "star",
        title: { ua: "Коли з'являється", ru: "Когда появляется", en: "When it appears" },
        text: {
          ua: "Через {from}–{to} с після старту арени, якщо є живі гравці. Після поразки повертається за {rfrom}–{rto} с.",
          ru: "Через {from}–{to} с после старта арены, если есть живые игроки. После поражения возвращается через {rfrom}–{rto} с.",
          en: "{from}–{to} s after the arena starts, if there are live players. After a defeat it returns in {rfrom}–{rto} s.",
        },
        params: {
          from: sec("boss.firstSpawnMinMs"),
          to: sec("boss.firstSpawnMaxMs"),
          rfrom: sec("boss.respawnMinMs"),
          rto: sec("boss.respawnMaxMs"),
        },
      },
      {
        id: "defeat",
        icon: "shield",
        title: { ua: "Його можна перемогти", ru: "Его можно победить", en: "He can be beaten" },
        text: {
          ua: "З'їсти Вожака може гравець більший за нього або група. Переможець отримує його масу й {boss} рубінів. Новачків (перші {grace} с на арені), гравців під щитом і на паузі Вожак не чіпає.",
          ru: "Съесть Вожака может игрок больше него или группа. Победитель получает его массу и {boss} рубинов. Новичков (первые {grace} с на арене), игроков под щитом и на паузе Вожак не трогает.",
          en: "The Alpha can be eaten by a bigger player or by a group. The winner gets its mass and {boss} rubies. It never attacks newcomers (first {grace} s on the arena), shielded or paused players.",
        },
        params: { boss: num("rubies.bossKillReward"), grace: sec("botGraceMs") },
      },
    ],
  },
  {
    id: "bonuses",
    title: { ua: "Бонуси на карті", ru: "Бонусы на карте", en: "Map bonuses" },
    entries: [
      {
        id: "speed",
        icon: "bonus:speed",
        title: { ua: "Прискорення", ru: "Ускорение", en: "Speed" },
        text: { ua: "Швидкість ×{mul} на {sec} с.", ru: "Скорость ×{mul} на {sec} с.", en: "Speed ×{mul} for {sec} s." },
        params: { mul: { path: "speedMultiplier", as: "x" }, sec: sec("bonusDurations.speed") },
      },
      {
        id: "magnet",
        icon: "bonus:magnet",
        title: { ua: "Магніт", ru: "Магнит", en: "Magnet" },
        text: { ua: "Притягує їжу навколо тебе {sec} с.", ru: "Притягивает еду вокруг тебя {sec} с.", en: "Pulls food towards you for {sec} s." },
        params: { sec: sec("bonusDurations.magnet") },
      },
      {
        id: "shield",
        icon: "bonus:shield",
        title: { ua: "Щит", ru: "Щит", en: "Shield" },
        text: { ua: "Тебе не можна з'їсти {sec} с.", ru: "Тебя нельзя съесть {sec} с.", en: "You can't be eaten for {sec} s." },
        params: { sec: sec("bonusDurations.shield") },
      },
      {
        id: "ghost",
        icon: "bonus:ghost",
        title: { ua: "Привид", ru: "Привидение", en: "Ghost" },
        text: {
          ua: "{sec} с проходиш крізь усіх: тебе не з'їдять, але й ти нікого й нічого не з'їси.",
          ru: "{sec} с проходишь сквозь всех: тебя не съедят, но и ты никого и ничего не съешь.",
          en: "For {sec} s you pass through everyone: nobody can eat you, but you can't eat anything either.",
        },
        params: { sec: sec("bonusDurations.ghost") },
      },
      {
        id: "double",
        icon: "bonus:double",
        title: { ua: "Подвійна маса", ru: "Двойная масса", en: "Double mass" },
        text: { ua: "Їжа дає вдвічі більше маси {sec} с.", ru: "Еда даёт вдвое больше массы {sec} с.", en: "Food gives twice the mass for {sec} s." },
        params: { sec: sec("bonusDurations.double") },
      },
      {
        id: "freeze",
        icon: "bonus:freeze",
        title: { ua: "Заморожування", ru: "Заморозка", en: "Freeze" },
        text: {
          ua: "Заморожує до {n} найближчих гравців на {sec} с. Тебе це не зачіпає.",
          ru: "Замораживает до {n} ближайших игроков на {sec} с. Тебя это не касается.",
          en: "Freezes up to {n} nearest players for {sec} s. You are not affected.",
        },
        params: { n: num("freezeMaxTargets"), sec: sec("bonusDurations.freeze") },
      },
      {
        id: "golden",
        icon: "bonus:golden",
        title: { ua: "Золоте руно", ru: "Золотое руно", en: "Golden fleece" },
        text: {
          ua: "Одразу додає {pct}% маси твоєї найбільшої частини (не менше {min}).",
          ru: "Сразу добавляет {pct}% массы твоей самой большой части (не меньше {min}).",
          en: "Instantly adds {pct}% of your biggest part's mass (at least {min}).",
        },
        params: { pct: pct("goldenMassFraction"), min: num("goldenMinMass") },
      },
      {
        id: "scissors",
        icon: "scissors",
        title: { ua: "Ножиці", ru: "Ножницы", en: "Scissors" },
        text: {
          ua: "Рідкісний. Стрижуть навколо всіх, у кого маса понад {mass}, на {pct}% (нижче {min} не опускають). Зрізане розсипається шерстю, яку може з'їсти будь-хто.",
          ru: "Редкий. Стригут вокруг всех, у кого масса больше {mass}, на {pct}% (ниже {min} не опускают). Срезанное рассыпается шерстью, которую может съесть любой.",
          en: "Rare. Shears everyone around with more than {mass} mass by {pct}% (never below {min}). The wool scatters as food anyone can eat.",
        },
        params: { mass: num("scissors.massThreshold"), pct: pct("scissors.cutFraction"), min: num("scissors.minMassAfter") },
      },
    ],
  },
  {
    id: "events",
    title: { ua: "Події арени", ru: "События арены", en: "Arena events" },
    entries: [
      {
        id: "zorepad",
        icon: "star",
        title: { ua: "Зорепад", ru: "Зорепад", en: "Starfall" },
        text: {
          ua: "Коли жива людина досягає маси {mass}, приблизно {sec} с з неба падають зірки (до {times} разів за гру). Кожна зірка дає {star} маси. Падають подалі від лідера (найкращого живого гравця) і ближче до менших.",
          ru: "Когда живой человек достигает массы {mass}, примерно {sec} с с неба падают звёзды (до {times} раз за игру). Каждая звезда даёт {star} массы. Падают подальше от лидера (лучшего живого игрока) и ближе к меньшим.",
          en: "When a live player reaches {mass} mass, stars fall from the sky for about {sec} s (up to {times} times per game). Each star gives {star} mass. They land away from the leader (the best live player) and closer to smaller ones.",
        },
        params: {
          mass: num("zorepad.triggerMass"),
          sec: sec("zorepad.durationMs"),
          times: num("zorepad.maxPerGame"),
          star: num("zorepad.starMass"),
        },
      },
    ],
  },
  {
    id: "food",
    title: { ua: "Їжа", ru: "Еда", en: "Food" },
    entries: [
      {
        id: "grass",
        icon: "leaf",
        title: { ua: "Трава", ru: "Трава", en: "Grass" },
        text: { ua: "Звичайна їжа: {mass} маси за пучок.", ru: "Обычная еда: {mass} массы за пучок.", en: "Regular food: {mass} mass per tuft." },
        params: { mass: num("foodMass") },
      },
      {
        id: "wool",
        icon: "scissors",
        title: { ua: "Шерсть", ru: "Шерсть", en: "Wool" },
        text: {
          ua: "Клаптики після «Ножиць»: маса дорівнює тому, що зрізали.",
          ru: "Клочки после «Ножниц»: масса равна тому, что срезали.",
          en: "Tufts left after Scissors: worth exactly what was sheared off.",
        },
      },
      {
        id: "thrown",
        icon: "boost",
        title: { ua: "Кинута маса", ru: "Брошенная масса", en: "Thrown mass" },
        text: {
          ua: "Шматки, які гравці кидають кнопкою «Кинути»: підібрати можна, щоб повернути чи забрати масу.",
          ru: "Куски, которые игроки бросают кнопкой «Бросить»: их можно подобрать, чтобы вернуть или забрать массу.",
          en: "Chunks players toss with “Throw”: pick them up to get the mass back or take it from others.",
        },
      },
      {
        id: "star",
        icon: "star",
        title: { ua: "Зірка", ru: "Звезда", en: "Star" },
        text: { ua: "Падає під час «Зорепаду»: {mass} маси.", ru: "Падает во время «Зорепада»: {mass} массы.", en: "Falls during Starfall: {mass} mass." },
        params: { mass: num("zorepad.starMass") },
      },
    ],
  },
  {
    id: "artifacts",
    title: { ua: "Артефакти", ru: "Артефакты", en: "Artifacts" },
    artifacts: true,
    intro: {
      text: {
        ua: "Надягаються поверх скіна, діє один. Купуються за {price} рубінів. Знайти їх можна в лобі: кнопка з іконкою артефакта поруч із «i».",
        ru: "Надеваются поверх скина, действует один. Покупаются за {price} рубинов. Найти их можно в лобби: кнопка с иконкой артефакта рядом с «i».",
        en: "Worn over a skin, one at a time. Cost {price} rubies each. Find them in the lobby: the artifact button next to “i”.",
      },
      params: { price: num("artifactPrice") },
    },
    entries: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      id: `a${n}`,
      icon: `artifact:${n}` as const,
      title: { ua: "", ru: "", en: "" },
      text: { ua: "", ru: "", en: "" },
    })),
  },
  {
    id: "maps",
    title: { ua: "Карти й кущі", ru: "Карты и кусты", en: "Maps and bushes" },
    entries: [
      {
        id: "maps",
        icon: "leaf",
        title: { ua: "Карти", ru: "Карты", en: "Maps" },
        text: {
          ua: "Арена випадково отримує одну з карт: звичайна (зелені кущі), «Роща» (осіннє листя) або «Сніг» (ялинки). Відрізняється лише вигляд.",
          ru: "Арена случайно получает одну из карт: обычная (зелёные кусты), «Роща» (осенняя листва) или «Снег» (ёлки). Отличается только вид.",
          en: "Each arena gets a random map: regular (green bushes), Grove (autumn leaves) or Snow (fir trees). Only the look differs.",
        },
      },
      {
        id: "bushes",
        icon: "shield",
        title: { ua: "Кущі", ru: "Кусты", en: "Bushes" },
        text: {
          ua: "Хто менший за кущ — ховається всередині й у безпеці. Клітина більша за кущ (від маси {pop}) рветься на частини, торкнувшись його. Так само й Вожак.",
          ru: "Кто меньше куста — прячется внутри и в безопасности. Клетка больше куста (от массы {pop}) рвётся на части, коснувшись его. Так же и Вожак.",
          en: "Anything smaller than a bush can hide inside and stay safe. A cell bigger than the bush (from {pop} mass) bursts into pieces when it touches it. The Alpha too.",
        },
        params: { pop: num("thornPopMass") },
      },
    ],
  },
  {
    id: "newbies",
    title: { ua: "Для новачків", ru: "Для новичков", en: "For newcomers" },
    entries: [
      {
        id: "shield",
        icon: "shield",
        title: { ua: "Щит на старті", ru: "Щит на старте", en: "Spawn shield" },
        text: {
          ua: "Після входу й відродження тебе не можна з'їсти {sec} с. Боти й Вожак не чіпають новачків перші {grace} с.",
          ru: "После входа и возрождения тебя нельзя съесть {sec} с. Боты и Вожак не трогают новичков первые {grace} с.",
          en: "After joining or respawning you can't be eaten for {sec} s. Bots and the Alpha leave newcomers alone for the first {grace} s.",
        },
        params: { sec: sec("spawnShieldMs"), grace: sec("botGraceMs") },
      },
      {
        id: "boost",
        icon: "boost",
        title: { ua: "Розгін", ru: "Разгон", en: "Speed boost" },
        text: {
          ua: "Перші {sec} с швидкість до +{pct}% (поступово слабшає), поки маса менша за {mass}.",
          ru: "Первые {sec} с скорость до +{pct}% (постепенно слабеет), пока масса меньше {mass}.",
          en: "For the first {sec} s you're up to {pct}% faster (fading out) while your mass is below {mass}.",
        },
        params: { sec: sec("spawnBoost.durationMs"), pct: pct("spawnBoost.speedBonus"), mass: num("spawnBoost.massLimit") },
      },
      {
        id: "resume",
        icon: "names",
        title: { ua: "«Овечка чекає»", ru: "«Овечка ждёт»", en: "“Sheep is waiting”" },
        text: {
          ua: "Якщо зв'язок обірвався, овечка {sec} с стоїть на паузі й її не можна з'їсти. Повернись, і ще {shield} с буде щит.",
          ru: "Если связь оборвалась, овечка {sec} с стоит на паузе и её нельзя съесть. Вернись, и ещё {shield} с будет щит.",
          en: "If you get disconnected, your sheep waits paused for {sec} s and can't be eaten. Come back and you get a {shield} s shield.",
        },
        params: { sec: sec("resumePauseMs"), shield: sec("resumeShieldMs") },
      },
    ],
  },
];

/** Значение по пути `a.b.c` из config.game; undefined - клиенту его не прислали. */
export function configValue(game: Record<string, unknown> | undefined, path: string): number | undefined {
  let cur: unknown = game;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : undefined;
}

function format(value: number, as: ParamFormat | undefined): string {
  const round = (n: number) => String(Math.round(n * 100) / 100);
  switch (as) {
    case "sec":
      return round(value / 1000);
    case "pct":
      return String(Math.round(value * 100));
    case "x":
      return round(value);
    default:
      return round(value);
  }
}

/** Подставляет числа в текст; если клиенту число не прислали (ещё грузится профиль) - «…». */
export function fillInfoText(text: string, params: Record<string, InfoParam> | undefined, game: Record<string, unknown> | undefined): string {
  return text.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const spec = params?.[name];
    if (!spec) return "…";
    const v = configValue(game, spec.path);
    return v === undefined ? "…" : format(v, spec.as);
  });
}
