# «Лабіринт» (Отара): контракт сервер ↔ клієнт

Окремий режим «Отари» (`mode: 'maze'`, окрема арена, картка в «Режимах»). Побудований на **спільній основі гонки**
(`flock.race.ts`, далі на ній буде «Печерний забіг»). Сервер авторитарний: рух, поїдання, чекпойнти, переможець, нагорода.
Клієнт передбачає рух і масу ТІЄЮ САМОЮ формулою та коригується під сервер. Цей файл - контракт для клієнта.

## 1. Вхід

Повідомлення `j` (як у «Замках»): `{ mode: 'maze', skin?: number, v: 2, resume?, arena? }`.
- Скін - будь-який доступний гравцеві (лише вигляд; бонуси скінів і артефакти вимкнені, `artifact` ігнорується).
- Помилки: `full` (арена заповнена), `maze_off` (режим вимкнено), решта як у звичайній арені (`skin_locked`, `skin_unavailable`).
- HTTP-лобі: `GET /api/flock/maze/lobby` -> `{ enabled, phase, leftMs, humans, max }` (картка в «Режимах»).

Вихід/обрив звʼязку: `leave` - одразу вибув; обрив довше `race.dropMs` (10 с) під час гонки = вибуває з раунду (стає глядачем до наступного).

## 2. Ввід

Існуюче повідомлення `i` (число). `angle` і `power` як у звичайній «Отарі» (`angle` у радіанах, напрям = (cos, sin), екранні осі).
**Прапорець `sprint` у вводі = кнопка «Ривок»** (ПК: пробіл). Ривок стартує по ФРОНТУ натискання, коли готовий. Поділ і кидок ігноруються.

## 3. Фази раунду (`race.phase` / `rz.p`)

| p | назва | тривалість (конфіг `race`) |
|---|-------|----------------------------|
| 0 | набір (lobby) | `lobbyMs` 20 с; сітки ще нема (`seed: null`) |
| 1 | відлік | `countdownMs` 5 с; приходить `rr` із seed, усі на старті, рух не починається клієнтом до `go` |
| 2 | гонка | до `maze.maxDurationMs` 180 с; після першого фінішу ще `finishGraceMs` 8 с на решту |
| 3 | підсумки | `resultsMs` 10 с, далі автоматично новий раунд |

Хто зайшов у фазах 2-3 - спостерігач (`st: 1`) до наступного набору. До 6 учасників (`race.maxParticipants`), боти добивають слоти (до 5).

## 4. `welcome` (`w`): що додається

`mode: 'maze'`, `race` (усе нижче; решта полів `w` для цього режиму неістотна, `thorns: []`), `view: { base: R, perSqrtMass: 0, max: R }` де `R = race.view.radius`.

```
race: {
  kind: 'maze',
  phase, left (мс до кінця фази), elapsed (мс гонки),
  round: string | null,         // унікальний ключ раунду
  seed: number | null,          // null у наборі; інакше seed поточного раунду
  timings: { lobbyMs, countdownMs, finishGraceMs, resultsMs, dropMs, maxParticipants },
  reward: { rubies: 5, dailyWinLimit: 3, minHumans: 2 },
  roster: [{ pid, n: ім'я, s: скін, b: 1 якщо бот, st: 0 гонщик | 1 глядач | 2 фінішував | 3 вибув }],
  you: { pid, st },
  results?: <тіло rs>,          // якщо зайшов у фазі підсумків
  maze: { cols, rows, cell, wall, braid, world, pathMin, pathMax, foodMin, foodMax, checkpoints, finishRadius, hash, traps },
  move: { base, exp, min, radiusK, startMass, minFactor, dash: { mult, durationMs, cooldownMs } },
  eat:  { ratio, overlap, gain, startMass, maxMass, foodMass, foodReach, foodRespawnMs, respawnAt, spawnProtectMs, dissolveMs, maxRespawns },
  view: { radius },
  hint: { arrowAfterMs },       // 0 - стрілка до фінішу вимкнена
  maxDurationMs,
  vis: number[],                // відвідані клітини цього гравця (для мінікарти після перепідключення)
}
```
`maze.hash` - хеш геометрії поточного сервера (`null` у наборі). Клієнт будує сітку з `maze` + `seed` і ПОРІВНЮЄ хеш (розбіжність = помилка клієнта).

## 5. Повідомлення сервера

- `rp` - склад учасників (рідко, при змінах): масив як `race.roster`.
- `rr` - початок відліку: `{ id, seed, ...race.maze/move/eat/view/hint/maxDurationMs }`; **сітка раунду будується з цього seed** (змінюється щораунду).
- `rz` - СТАН КОЖЕН ТІК (JSON) для кожного гравця:
  ```
  { p, l (мс до кінця фази), e (мс гонки), st, pl (твоє живе місце), n (скільки гонщиків),
    sp?: pid,            // ти спостерігач: m/c/f - з погляду цього учасника (лідера)
    m: [x, y, mass, dashLeftMs, dashCdMs, protectLeftMs, cp, dissolveLeftMs],  // ТВОЯ клітина (авторитетна)
    c: [[pid, x, y, mass, fl]],   // інші клітини В РАДІУСІ ОГЛЯДУ; fl: 1 захист, 2 розчиняється, 4 фінішував, 8 бот
    f: [[id, x, y]],               // їжа в радіусі (лише та, що лежить)
    nv?: number[],                 // нові відвідані клітини (мінікарта)
    ha?: number }                  // кут до фінішу, якщо hint.arrowAfterMs > 0 і час минув
  ```
  Позицій чужих учасників поза радіусом сервер НЕ шле. **Мінікарта показує лише: себе, відвідані клітини (`vis` + `nv`), фініш. Чужих не малювати взагалі.**
  Координати - світові, цілі (маса з одним десятковим). Світ 3400; лабіринт по центру.
- `rv` - події `{ k, ... }`: `lobby`, `go` (старт гонки), `cp` `{i}` (чекпойнт пройдено, i = скільки тепер; HUD «Чекпоінт!»), `fin` `{t, place}` (ти фінішував), `win` `{pid, name, t}` (хтось виграв), `eaten` `{by, pid}` (тост «Тебе зʼїв <by>»), `ate` `{name, pid}` (тост «Ти зʼїв <name>»), `respawn` `{cp}`, `drop` `{why: 'respawns'|'disconnect'}`, `needcp` `{cp, of}` (торкнувся кристала без усіх чекпойнтів).
- `rs` - підсумок раунду (всім): `{ id, kind, seed, durationMs, win: pid|0, rows: [{ pid, name, bot, place, t: мс|null, cp, ate, eatenBy, status }], reward: { rubies, pending, reason?, limit } }`.
  `reward.pending: true` - переможцю належить нагорода, чекаємо підтвердження БД (`rw`); `reason` (якщо нагороди нема): `noWinner | bot | humans | afk | incomplete | tooFast | spectator`. Колонки «Зʼїв» = `ate`, «Зʼїдений» = `eatenBy`.
- `rw` - лише переможцю, після запису в БД: `{ rubies, balance?, reason?: 'daily'|'cap', limit }`; `rubies: 0` + `reason` - нагороди нема (добовий ліміт 3 на ВСІ гоночні режими разом або добовий потолок рубінів).

## 6. Спільний код (клієнт копіює без змін логіки)

Два чисті файли без імпортів, їх копіюємо на веб:
- `apps/backend/src/flock/flock.maze.grid.ts` -> `apps/web/src/components/FlockMiniGame/flockMazeGrid.ts`
- `apps/backend/src/flock/flock.race.shared.ts` -> `apps/web/src/components/FlockMiniGame/flockRaceShared.ts`

Експорт `flock.maze.grid.ts`: `MazeParams`, `MazeGrid`, `mulberry32`, `buildMaze(params)`, `mazeHash(grid)`, `moveInMaze(g, x, y, mx, my, r)` (ЄДИНА функція руху й ковзання), `pushOut`, `cellAt`, `cellCenter`, `inCellInterior`, `openNeighbors`, `OPEN_N/E/S/W`.
Експорт `flock.race.shared.ts`: `RaceMoveParams`, `raceSpeed(mass, move)`, `radiusOfMass(mass, radiusK)`, `DashState`, `newDash`, `stepDash(dash, want, dtMs, move)`.

`MazeParams` для клієнта: `{ seed, ...race.maze (cols, rows, cell, wall, braid, world, pathMin, pathMax, foodMin, foodMax, checkpoints) }`.

### Передбачення руху клієнта (кожен кадр/тік)
```
mult  = stepDash(dash, sprintPressed, dtMs, move)
r     = radiusOfMass(mass, move.radiusK)
speed = raceSpeed(mass, move) * mult * power
[x,y] = moveInMaze(grid, x, y, cos(angle)*speed*dt, sin(angle)*speed*dt, r)
```
`mass` клієнт бере з `rz.m` (маса росте лише від їжі й з'їдених - рішає сервер). При розбіжності з `rz.m` - м'яка корекція (лерп до сервера); стіни ніколи не перетинати (та сама `moveInMaze`). Ривок стіни не проходить: крок розбивається на підкроки ≤ r/2.

## 7. Формули (сервер = клієнт)

- Радіус: `radiusK * sqrt(mass)` (як у «Отарі»). Швидкість: `max(max(min, base*mass^exp), minFactor * max(min, base*startMass^exp))`, помножена на `power`.
- Ривок: x`dash.mult` швидкості `dash.durationMs`, перезарядка `dash.cooldownMs` від початку ривка; кнопка - по фронту.
- Поїдання: `a` їсть `b`, якщо `a.mass >= b.mass * eat.ratio` І `dist < ra - rb * eat.overlap`. Не їсть/не зʼїдається: хто під захистом (`protect`), розчиняється, фінішував. Інакше клітини проходять одна крізь одну (без штовхання).
- Їжа: `+foodMass`, відростає через `foodRespawnMs` на тому ж місці. Зʼїв клітину: `+eat.gain * маса жертви`. Стеля `maxMass`.
- З'їдена клітина розчиняється `dissolveMs`, потім відроджується в стартовій кімнаті (`respawnAt: 'start'`: чекпойнти й прогрес скинуті; `'checkpoint'`: на останньому чекпойнті), захист `spawnProtectMs`; більше `maxRespawns` разів за раунд - вибуває.
- Чекпойнти строго по порядку (центр клітини-вузла у її внутрішності); кристал зараховується лише після всіх. Місце: за часом фінішу, решта - за близькістю до фінішу.

## 8. Нагорода (лише сервер)

Переможцю 5 рубінів (`RACE_WIN`), одна транзакція з унікальним ключем раунду (`race.round`, зберігається в `note` запису журналу; повторний розрахунок не нараховує), входить у `rubies.dailyEarnCap`, не більше 3 оплачуваних перемог на добу (за Києвом) на ВСІ гоночні режими разом. Умови: ≥ `race.reward.minHumans` (2) живих людей у раунді, переможець не AFK (≥ `afkMinActions` вводів, ≥ `afkMinMove` одиниць), пройшов усі чекпойнти по порядку після останнього відродження, час не менший за `minTimeSlack` × мінімально можливий. Проти самих ботів нагороди нема. Смарагдів нема. Поїдання, їжа, рекорди, завдання, досягнення, серія першого місця й рекорди дня режимом не змінюються.

## 9. Конфіг (`FLOCK_CONFIG`)

`race`: `enabled, maxParticipants, lobbyMs, countdownMs, finishGraceMs, resultsMs, dropMs, dash{mult,durationMs,cooldownMs}, reward{rubies,dailyWinLimit,minHumans,afkMinActions,afkMinMove,minTimeSlack}`.
`maze`: `enabled, maxArenas, maxDurationMs, cols, rows, cell, wall, braid, pathMin, pathMax, checkpoints, startMass, maxMass, foodMass, foodMin, foodMax, foodRespawnMs, eatGain, minSpeedFactor, respawnAt, spawnProtectMs, dissolveMs, maxRespawns, viewRadius, hintArrowAfterMs, mazeTraps, finishRadius, bots{max,easy,medium,eatRadius,eatDetourCells,foodDetourCells}`. `eatRatio`/`eatOverlap` беруться з верхнього рівня (як у звичайній «Отарі»).

## 10. Звірка сітки (паритет)

`cd apps/backend && node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/maze-hash.ts 1000 > server.txt` - рядки `seed hash pathCells checkpoints salt` для 1000 seed. Клієнт друкує такі самі рядки з своєю копією `flock.maze.grid.ts` (параметри - ті самі `maze` із welcome); файли мають збігтися.

## 11. Ловушки

У лабіринті їх НЕМАЄ. Прапорець `maze.mazeTraps` (false) - лише заготовка: якщо його колись увімкнуть, вогняні плити в тупиках без попереджень (постійний ритм, завжди видні), влучання відправляє на останній чекпойнт із захистом 2 с, без смерті. Поки прапорець вимкнений, нічого не підключати й не малювати.
