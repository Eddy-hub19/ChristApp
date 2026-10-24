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
          ua: "У лобі — таблиця «Рекорди дня»: топ-{top} за найбільшою масою за добу (за часом Києва), скидається опівночі. Боти й Вожак не рахуються. Хто {days} дні поспіль посідає 1-ше місце за день (з масою від {mass}), отримує {reward} рубінів — поза добовим лімітом арени. Після нагороди серія починається заново; якщо наступного дня 1-ше місце візьме хтось інший, серія обривається. Хто тримає серію, у «Топ-10» на арені має корону й число днів, а в лобі біля №1 написано «Серія: N дн.».",
          ru: "В лобби — таблица «Рекорды дня»: топ-{top} по наибольшей массе за сутки (по времени Киева), сбрасывается в полночь. Боты и Вожак не считаются. Кто {days} дня подряд занимает 1-е место за день (с массой от {mass}), получает {reward} рубинов — вне суточного лимита арены. После награды серия начинается заново; если на следующий день 1-е место займёт кто-то другой, серия обрывается. У того, кто держит серию, в «Топ-10» на арене есть корона и число дней, а в лобби рядом с №1 написано «Серия: N дн.».",
          en: "The lobby shows a “Daily records” table: top {top} by biggest mass of the day (Kyiv time), reset at midnight. Bots and the Alpha don't count. Finish 1st of the day (with a mass of {mass}+) {days} days in a row to earn {reward} rubies — outside the arena's daily limit. After the reward the streak starts over; if someone else takes 1st the next day, the streak breaks. Whoever holds the streak gets a crown and the number of days in the arena's Top 10, and the lobby shows “Streak: N d” next to #1.",
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
      {
        id: "skins",
        icon: "skins",
        title: { ua: "Скіни", ru: "Скины", en: "Skins" },
        text: {
          ua: "Безкоштовних скінів кілька: шість овечок, окремий ряд вовків (сірий, чорний, бурий, білий, рудий і блакитно-сірий) та ще кілька друзів. За рубіни відкриваються звичайні, «Преміум» (з анімацією) й «Особливі» скіни. Куплений скін лишається в тебе назавжди.",
          ru: "Бесплатных скинов несколько: шесть овечек, отдельный ряд волков (серый, чёрный, бурый, белый, рыжий и сине-серый) и ещё несколько друзей. За рубины открываются обычные, «Премиум» (с анимацией) и «Особенные» скины. Купленный скин остаётся у тебя навсегда.",
          en: "There are several free skins: six sheep, a separate row of wolves (gray, black, brown, white, red and blue-gray) and a few more friends. Rubies unlock regular, Premium (animated) and Special skins. A skin you bought is yours for good.",
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
        icon: "alpha",
        title: { ua: "Хто це", ru: "Кто это", en: "Who is it" },
        text: {
          ua: "Сильний темний вовк із золотою короною. З'являється з масою лідера ×{mult} (не менше {start}), завжди більший за найкращого живого гравця, але не росте понад лідер ×{ceil} і понад {max}. Полює на великих гравців, заганяє їх до краю карти, ховається в кущах і тікає від груп. Якщо він з'їв лідера таблиці, усі на арені бачать повідомлення.",
          ru: "Сильный тёмный волк с золотой короной. Появляется с массой лидера ×{mult} (не меньше {start}), всегда больше лучшего живого игрока, но не растёт выше лидер ×{ceil} и выше {max}. Охотится на крупных игроков, загоняет их к краю карты, прячется в кустах и убегает от групп. Если он съел лидера таблицы, все на арене видят сообщение.",
          en: "A strong dark wolf with a golden crown. It appears at the leader's mass ×{mult} (at least {start}), always bigger than the best live player, but never grows past leader ×{ceil} or {max}. It hunts big players, herds them to the edge of the map, hides in bushes and runs from groups. If it eats the table leader, everyone on the arena sees a message.",
        },
        params: {
          start: num("boss.startMass"),
          max: num("boss.maxMass"),
          mult: num("boss.leaderSpawnMultiplier"),
          ceil: num("boss.leaderCeilMultiplier"),
        },
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
          ua: "Рідкісний. Стрижуть усіх навколо, у кого маса понад {mass}: кожен втрачає {pct}% маси (нижче {min} не опускають). Уся зрізана маса переходить тому, хто взяв ножиці, але за раз він отримує не більше, ніж має сам. Новачків, гравців під щитом і на паузі не чіпають.",
          ru: "Редкий. Стригут всех вокруг, у кого масса больше {mass}: каждый теряет {pct}% массы (ниже {min} не опускают). Вся срезанная масса переходит тому, кто взял ножницы, но за раз он получает не больше, чем имеет сам. Новичков, игроков под щитом и на паузе не трогают.",
          en: "Rare. Shears everyone around with more than {mass} mass: each loses {pct}% of their mass (never below {min}). All the sheared mass goes to whoever took the scissors, but they gain at most as much as they already have. Newcomers, shielded and paused players are safe.",
        },
        params: { mass: num("scissors.massThreshold"), pct: pct("scissors.cutFraction"), min: num("scissors.minMassAfter") },
      },
      {
        id: "eagle",
        icon: "bonus:eagle",
        title: { ua: "Орлиний зір", ru: "Орлиный взор", en: "Eagle eye" },
        text: {
          ua: "{sec} с камера віддаляється приблизно на {pct}%, і ти бачиш більше карти (сервер надсилає тобі ширшу область). Боти цього не отримують.",
          ru: "{sec} с камера отдаляется примерно на {pct}%, и ты видишь больше карты (сервер присылает тебе более широкую область). Боты этого не получают.",
          en: "For {sec} s the camera pulls back by about {pct}% so you see more of the map (the server sends you a wider area). Bots don't get this.",
        },
        params: { sec: sec("bonusDurations.eagle"), pct: num("eagle.zoomPct") },
      },
    ],
  },
  {
    id: "events",
    title: { ua: "Події арени", ru: "События арены", en: "Arena events" },
    entries: [
      {
        id: "zorepad",
        icon: "starfall",
        title: { ua: "Зорепад", ru: "Зорепад", en: "Starfall" },
        text: {
          ua: "Коли жива людина досягає маси {mass}, приблизно {sec} с з неба падають зірки (один гравець може запустити зорепад не більше {times} разів за життя). Кожна зірка дає {star} маси. Падають подалі від лідера (найкращого живого гравця) і ближче до менших.",
          ru: "Когда живой человек достигает массы {mass}, примерно {sec} с с неба падают звёзды (один игрок может запустить звездопад не больше {times} раз за жизнь). Каждая звезда даёт {star} массы. Падают подальше от лидера (лучшего живого игрока) и ближе к меньшим.",
          en: "When a live player reaches {mass} mass, stars fall from the sky for about {sec} s (one player can trigger it at most {times} times per life). Each star gives {star} mass. They land away from the leader (the best live player) and closer to smaller ones.",
        },
        params: {
          mass: num("zorepad.triggerMass"),
          sec: sec("zorepad.durationMs"),
          times: num("zorepad.maxPerPlayerLife"),
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
          ua: "Арена випадково отримує одну з карт з рівною ймовірністю: звичайний луг, «Гай» (золоте листя на бурій землі), «Мороз» (сніг, ялинки, ягоди горобини й шишки) або «Вулкан» (темна земля з жаром, обгорілі кущі й іскри замість трави). Усюди їжа має ту саму цінність, а вигляд карти однаковий в усіх гравців арени. Лише «Вулкан» змінює правила: на ньому є лава.",
          ru: "Арена случайно получает одну из карт с равной вероятностью: обычный луг, «Роща» (золотая листва на бурой земле), «Мороз» (снег, ёлки, ягоды рябины и шишки) или «Вулкан» (тёмная земля с жаром, обгорелые кусты и искры вместо травы). Везде еда имеет ту же ценность, а вид карты одинаков у всех игроков арены. Только «Вулкан» меняет правила: на нём есть лава.",
          en: "Each arena gets a random map with equal probability: the regular meadow, Grove (golden leaves on brown soil), Frost (snow, firs, rowan berries and cones) or Volcano (dark ground with embers, charred bushes and sparks instead of grass). Food is worth the same everywhere, and the map looks the same to everyone on the arena. Only Volcano changes the rules: it has lava.",
        },
      },
      {
        id: "lava",
        icon: "lava",
        title: { ua: "Лава («Вулкан»)", ru: "Лава («Вулкан»)", en: "Lava (Volcano)" },
        text: {
          ua: "Посеред карти тече річка лави на всю ширину (близько {pct}% висоти), через неї є {bmin}–{bmax} мостів. Клітина, чий центр опинився в лаві поза мостом, згорає: її маса нікому не дістається, кожна частина гине окремо, а коли згоріла остання, ти програв. Новачка на стартовому щиті й гравця на паузі лава не вбиває, їх виштовхує на берег. «Привид» і бонус «Щит» від лави не рятують. Боти й Вожак лаву обходять мостами. Коли підпливаєш близько, навколо клітини мигає червоне кільце, а край екрана червоніє.",
          ru: "Посреди карты течёт река лавы на всю ширину (около {pct}% высоты), через неё есть {bmin}–{bmax} мостов. Клетка, чей центр оказался в лаве вне моста, сгорает: её масса никому не достаётся, каждая часть гибнет отдельно, а когда сгорела последняя, ты проиграл. Новичка на стартовом щите и игрока на паузе лава не убивает, их выталкивает на берег. «Привидение» и бонус «Щит» от лавы не спасают. Боты и Вожак лаву обходят по мостам. Когда подходишь близко, вокруг клетки мигает красное кольцо, а край экрана краснеет.",
          en: "A river of lava runs across the middle of the map (about {pct}% of its height) with {bmin}–{bmax} bridges. A cell whose center ends up in the lava off a bridge burns: its mass goes to nobody, each part dies separately, and when the last one burns you lose. A newcomer on the start shield and a paused player are not killed, they are pushed to the shore. The Ghost and the Shield bonus do not save you from lava. Bots and the Alpha use the bridges. When you get close, a red ring flashes around your cell and the screen edge turns red.",
        },
        params: { pct: pct("lava.riverFraction"), bmin: num("lava.bridgesMin"), bmax: num("lava.bridgesMax") },
      },
      {
        id: "fence",
        icon: "fence",
        title: { ua: "Загорожа", ru: "Ограда", en: "Fence" },
        text: {
          ua: "Арена обнесена загоном у стилі карти: дерево, сніг, сухе дерево. Це край світу: далі йти не можна. На мінікарті межа показана тонкою рамкою.",
          ru: "Арена обнесена загоном в стиле карты: дерево, снег, сухое дерево. Это край мира: дальше идти нельзя. На миникарте граница показана тонкой рамкой.",
          en: "The arena is enclosed by a pen in the map's style: wood, snow, dry wood. It is the edge of the world; you can't go past it. The minimap shows the border as a thin frame.",
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

/** Числа для описаний артефактов (flock.artifacts.items.N.desc): из config.game, пока профиль не загружен - «…». */
export function artifactDescParams(game: Record<string, unknown> | undefined): Record<string, string> {
  const get = (path: string, as?: ParamFormat) => {
    const v = configValue(game, path);
    return v === undefined ? "…" : format(v, as);
  };
  return {
    hatFree: get("artifacts.priestHatFreeMs", "sec"),
    hatPeriod: (() => {
      const v = configValue(game, "artifacts.priestHatPeriodMs");
      return v === undefined ? "…" : String(Math.round((v / 60_000) * 100) / 100);
    })(),
    magnetPct: get("artifacts.magnetPullBonus", "pct"),
    revivePct: get("artifacts.reviveMassFraction", "pct"),
    censerRadius: get("artifacts.censerRadius"),
  };
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
