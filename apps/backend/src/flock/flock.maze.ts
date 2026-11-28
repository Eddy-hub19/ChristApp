/**
 * Режим «Лабіринт»: траса для гоночної основи (flock.race.ts). Сітка й колізії - чистий спільний код (flock.maze.grid.ts),
 * тут: рух, чекпойнти, їжа в тупиках, поїдання, відродження, огляд (лише клітини й їжа в радіусі), боти.
 * Жодних позицій чужих учасників поза радіусом огляду клієнту не шлеться (мінікарта чужих не показує взагалі).
 */
import { FLOCK_CONFIG as C } from './flock.config';
import type { RaceCourse, RaceEntrant, RaceHost } from './flock.race';
import {
  type MazeGrid,
  type MazeParams,
  buildMaze,
  cellAt,
  cellCenter,
  inCellInterior,
  moveInMaze,
  openNeighbors,
} from './flock.maze.grid';
import { type RaceMoveParams, radiusOfMass, raceSpeed, stepDash } from './flock.race.shared';

const M = C.maze;
const FOOD_REACH = C.foodRadius * C.foodTouch;

/** Параметри руху з конфігу (клієнт отримує їх у welcome і рахує тією самою формулою). */
export function mazeMoveParams(): RaceMoveParams {
  return {
    base: C.baseSpeed,
    exp: C.speedMassExp,
    min: C.minSpeed,
    radiusK: C.radiusK,
    startMass: M.startMass,
    minFactor: M.minSpeedFactor,
    dash: { ...C.race.dash },
  };
}

export function mazeParams(seed: number): MazeParams {
  return {
    seed,
    cols: M.cols,
    rows: M.rows,
    cell: M.cell,
    wall: M.wall,
    braid: M.braid,
    world: C.worldSize,
    foodMin: M.foodMin,
    foodMax: M.foodMax,
    checkpoints: M.checkpoints,
    pathMin: M.pathMin,
    pathMax: M.pathMax,
  };
}

interface FoodItem {
  id: number;
  x: number;
  y: number;
  cell: number;
  /** 0 - лежить; інакше мс годинника матчу, коли виросте знову. */
  respawnAt: number;
}

interface Brain {
  /** Цільова клітина (куди йдемо зараз) і звідки прийшли. */
  target: number;
  from: number;
  /** Скільки клітин іще йдемо «не туди» (після помилки на розвилці). */
  detour: number;
  hesitateUntil: number;
  threatAt: number;
  dashHeld: boolean;
  /** pid клітини, за якою женемося в межах однієї клітини лабіринту (0 - нема). */
  chase: number;
  /** id їжі, до якої йдемо в межах поточної клітини (-1 - нема). */
  chaseFood: number;
  lastX: number;
  lastY: number;
  lastCheck: number;
}

interface MazeData {
  visited: Set<number>;
  nv: number[];
  cell: number;
  brain?: Brain;
  cpWarnAt: number;
}

const D = (e: RaceEntrant): MazeData => {
  const d = e.data as unknown as MazeData;
  if (!d.visited) {
    d.visited = new Set();
    d.nv = [];
    d.cell = -1;
    d.cpWarnAt = 0;
  }
  return d;
};

export class MazeCourse implements RaceCourse {
  readonly kind = 'maze';
  grid!: MazeGrid;
  private food: FoodItem[] = [];
  private foodByCell = new Map<number, number[]>();
  private readonly move = mazeMoveParams();
  /** Усі учасники (для огляду й ботів) - оновлюється на кожному кроці. */
  private all: RaceEntrant[] = [];
  private raceStartAt = 0;
  private lastNow = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get maxDurationMs() {
    return M.maxDurationMs;
  }

  prepare(seed: number) {
    this.grid = buildMaze(mazeParams(seed));
    this.food = this.grid.food.map((f, id) => ({ id, x: f.x, y: f.y, cell: cellAt(this.grid, f.x, f.y), respawnAt: 0 }));
    this.foodByCell.clear();
    for (const f of this.food) {
      const arr = this.foodByCell.get(f.cell) ?? [];
      arr.push(f.id);
      this.foodByCell.set(f.cell, arr);
    }
  }

  minTimeMs() {
    return (this.grid.pathLen / (raceSpeed(M.startMass, this.move) * this.move.dash.mult)) * 1000;
  }

  checkpointCount() {
    return this.grid.checkpoints.length;
  }

  place(e: RaceEntrant, slot: number, now: number) {
    const [x, y] = this.grid.startSlots[slot % this.grid.startSlots.length];
    e.x = x;
    e.y = y;
    e.mass = M.startMass;
    e.cp = 0;
    e.dissolveUntil = 0;
    e.protectUntil = 0;
    e.power = 0;
    e.wantDash = false;
    e.dash.leftMs = 0;
    e.dash.cdMs = 0;
    e.dash.held = false;
    const d = D(e);
    d.visited = new Set();
    d.nv = [];
    d.cell = cellAt(this.grid, x, y);
    d.brain = undefined;
    d.cpWarnAt = 0;
    void now;
  }

  /** Відродження після з'їдання: у стартову кімнату з нуля (або на останній чекпойнт), захист spawnProtectMs. */
  private respawn(e: RaceEntrant, now: number, host: RaceHost) {
    e.respawns++;
    if (e.respawns > M.maxRespawns) {
      e.dissolveUntil = 0;
      host.drop(e, 'respawns');
      return;
    }
    const g = this.grid;
    e.mass = M.startMass;
    e.dissolveUntil = 0;
    e.protectUntil = now + M.spawnProtectMs;
    e.dash.leftMs = 0;
    e.dash.cdMs = 0;
    e.dash.held = false;
    if (M.respawnAt === 'checkpoint' && e.cp > 0) {
      const [x, y] = cellCenter(g, g.checkpoints[e.cp - 1]);
      e.x = x;
      e.y = y;
    } else {
      const [x, y] = g.startSlots[(e.pid + e.respawns) % g.startSlots.length];
      e.x = x;
      e.y = y;
      e.cp = 0;
    }
    const d = D(e);
    d.cell = cellAt(g, e.x, e.y);
    d.brain = undefined;
    host.emit(e.pid, 'rv', { k: 'respawn', cp: e.cp });
  }

  step(dtMs: number, racers: RaceEntrant[], now: number, host: RaceHost) {
    this.lastNow = now;
    this.all = racers;
    const g = this.grid;
    const dt = dtMs / 1000;
    // їжа відростає на тому ж місці
    for (const f of this.food) if (f.respawnAt > 0 && now >= f.respawnAt) f.respawnAt = 0;

    for (const e of racers) {
      if (e.dissolveUntil > 0) {
        if (now >= e.dissolveUntil) this.respawn(e, now, host);
        continue;
      }
      const d = D(e);
      const mult = stepDash(e.dash, e.wantDash, dtMs, this.move);
      const r = radiusOfMass(e.mass, this.move.radiusK);
      const speed = raceSpeed(e.mass, this.move) * mult * e.power;
      if (speed > 0) {
        const [nx, ny] = moveInMaze(g, e.x, e.y, Math.cos(e.angle) * speed * dt, Math.sin(e.angle) * speed * dt, r);
        e.moved += Math.hypot(nx - e.x, ny - e.y);
        e.x = nx;
        e.y = ny;
      }
      const cell = cellAt(g, e.x, e.y);
      if (cell >= 0 && cell !== d.cell) {
        d.cell = cell;
        if (!d.visited.has(cell)) {
          d.visited.add(cell);
          d.nv.push(cell);
        }
      }
      // чекпойнти - строго по порядку; повз вузол не обійти, тож «центр у внутрішності клітини» не пропускається
      const next = g.checkpoints[e.cp];
      if (next !== undefined && inCellInterior(g, next, e.x, e.y)) host.checkpoint(e, e.cp + 1);
      // кристал: торкнутись можна лише після всіх чекпойнтів
      if (Math.hypot(e.x - g.finishX, e.y - g.finishY) <= M.finishRadius) {
        if (e.cp >= g.checkpoints.length) {
          host.finish(e);
          continue;
        }
        if (now - d.cpWarnAt > 2000) {
          d.cpWarnAt = now;
          host.emit(e.pid, 'rv', { k: 'needcp', cp: e.cp, of: g.checkpoints.length });
        }
      }
      // їжа
      const here = this.foodByCell.get(d.cell);
      if (here) {
        for (const id of here) {
          const f = this.food[id];
          if (f.respawnAt > 0) continue;
          if (Math.hypot(e.x - f.x, e.y - f.y) < r + FOOD_REACH) {
            f.respawnAt = now + M.foodRespawnMs;
            e.mass = Math.min(M.maxMass, e.mass + M.foodMass);
          }
        }
      }
    }
    this.stepEating(racers, now, host);
  }

  /** Поїдання: лише між близькими клітинами через сітку лабіринту (корзини за клітиною + сусідні), без перебору всіх пар. */
  private stepEating(racers: RaceEntrant[], now: number, host: RaceHost) {
    const g = this.grid;
    const buckets = new Map<number, RaceEntrant[]>();
    for (const e of racers) {
      if (e.dissolveUntil > 0 || e.protectUntil > now) continue;
      const d = D(e);
      if (d.cell < 0) continue;
      const arr = buckets.get(d.cell) ?? [];
      arr.push(e);
      buckets.set(d.cell, arr);
    }
    if (buckets.size === 0) return;
    for (const [cell, list] of buckets) {
      const c = cell % g.cols;
      const rr = (cell - c) / g.cols;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nc = c + dx;
          const nr = rr + dy;
          if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
          const other = buckets.get(nr * g.cols + nc);
          if (!other) continue;
          for (const a of list) {
            for (const b of other) {
              // кожна пара - раз: за порядком pid
              if (a.pid >= b.pid) continue;
              if (a.dissolveUntil > 0 || b.dissolveUntil > 0) continue;
              this.tryEat(a, b, now, host) || this.tryEat(b, a, now, host);
            }
          }
        }
      }
    }
  }

  private tryEat(eater: RaceEntrant, victim: RaceEntrant, now: number, host: RaceHost): boolean {
    if (eater.mass < victim.mass * C.eatRatio) return false;
    const ra = radiusOfMass(eater.mass, this.move.radiusK);
    const rb = radiusOfMass(victim.mass, this.move.radiusK);
    if (Math.hypot(eater.x - victim.x, eater.y - victim.y) >= ra - rb * C.eatOverlap) return false;
    const gain = victim.mass * M.eatGain;
    eater.mass = Math.min(M.maxMass, eater.mass + gain);
    victim.dissolveUntil = now + M.dissolveMs;
    victim.power = 0;
    host.eaten(victim, eater);
    return true;
  }

  rankKey(e: RaceEntrant): number {
    const g = this.grid;
    if (!g) return 0;
    const cell = cellAt(g, e.x, e.y);
    if (cell < 0) return Infinity;
    const [cx, cy] = cellCenter(g, cell);
    return g.dist[cell] * g.cell + Math.hypot(e.x - cx, e.y - cy);
  }

  // ---------------------------------------------------------------- огляд (що бачить клієнт)

  viewFor(e: RaceEntrant, focus: RaceEntrant, all: Iterable<RaceEntrant>, now: number, elapsedMs: number): object {
    const g = this.grid;
    // набір: сітки ще нема (seed з'являється з початком відліку) - клієнту нічого малювати
    if (!g) return { m: [0, 0, M.startMass, 0, 0, 0, 0, 0], c: [], f: [] };
    const R = M.viewRadius;
    const me = focus;
    const d = D(e);
    const out: Record<string, unknown> = {
      m: [
        Math.round(me.x),
        Math.round(me.y),
        Math.round(me.mass * 10) / 10,
        Math.round(me.dash.leftMs),
        Math.round(me.dash.cdMs),
        Math.max(0, Math.round(me.protectUntil - now)),
        me.cp,
        me.dissolveUntil > 0 ? Math.max(0, Math.round(me.dissolveUntil - now)) : 0,
      ],
    };
    const cells: number[][] = [];
    for (const o of all) {
      if (o === me || (o.status !== 'racing' && o.status !== 'finished')) continue;
      if (Math.abs(o.x - me.x) > R || Math.abs(o.y - me.y) > R || Math.hypot(o.x - me.x, o.y - me.y) > R) continue;
      let fl = 0;
      if (o.protectUntil > now) fl |= 1;
      if (o.dissolveUntil > 0) fl |= 2;
      if (o.status === 'finished') fl |= 4;
      if (o.bot) fl |= 8;
      cells.push([o.pid, Math.round(o.x), Math.round(o.y), Math.round(o.mass * 10) / 10, fl]);
    }
    out.c = cells;
    // їжа в радіусі: перебір лише тих клітин лабіринту, що потрапляють у квадрат огляду
    const food: number[][] = [];
    const c0 = Math.max(0, Math.floor((me.x - R - g.ox) / g.cell));
    const c1 = Math.min(g.cols - 1, Math.floor((me.x + R - g.ox) / g.cell));
    const r0 = Math.max(0, Math.floor((me.y - R - g.oy) / g.cell));
    const r1 = Math.min(g.rows - 1, Math.floor((me.y + R - g.oy) / g.cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ids = this.foodByCell.get(r * g.cols + c);
        if (!ids) continue;
        for (const id of ids) {
          const f = this.food[id];
          if (f.respawnAt > 0) continue;
          if (Math.hypot(f.x - me.x, f.y - me.y) <= R) food.push([f.id, f.x, f.y]);
        }
      }
    }
    out.f = food;
    // нові відвідані клітини - лише власні (мінікарта)
    if (e === me && d.nv.length) {
      out.nv = d.nv.splice(0);
    }
    if (M.hintArrowAfterMs > 0 && elapsedMs >= M.hintArrowAfterMs && me.status === 'racing') {
      out.ha = Math.round(Math.atan2(g.finishY - me.y, g.finishX - me.x) * 1000) / 1000;
    }
    return out;
  }

  /** Постійні параметри для клієнта: сітка будується з seed раунду тією ж функцією; формули руху, поїдання, огляду. */
  welcome(): object {
    return {
      maze: {
        cols: M.cols,
        rows: M.rows,
        cell: M.cell,
        wall: M.wall,
        braid: M.braid,
        world: C.worldSize,
        pathMin: M.pathMin,
        pathMax: M.pathMax,
        foodMin: M.foodMin,
        foodMax: M.foodMax,
        checkpoints: M.checkpoints,
        finishRadius: M.finishRadius,
        hash: this.grid?.hash ?? null,
        traps: M.mazeTraps,
      },
      move: this.move,
      eat: {
        ratio: C.eatRatio,
        overlap: C.eatOverlap,
        gain: M.eatGain,
        startMass: M.startMass,
        maxMass: M.maxMass,
        foodMass: M.foodMass,
        foodReach: FOOD_REACH,
        foodRespawnMs: M.foodRespawnMs,
        respawnAt: M.respawnAt,
        spawnProtectMs: M.spawnProtectMs,
        dissolveMs: M.dissolveMs,
        maxRespawns: M.maxRespawns,
      },
      view: { radius: M.viewRadius },
      hint: { arrowAfterMs: M.hintArrowAfterMs },
      maxDurationMs: M.maxDurationMs,
    };
  }

  welcomeFor(e: RaceEntrant): object {
    return { vis: [...D(e).visited] };
  }

  // ---------------------------------------------------------------- боти

  thinkBot(e: RaceEntrant, racers: RaceEntrant[], now: number) {
    if (e.dissolveUntil > 0) {
      e.power = 0;
      e.wantDash = false;
      return;
    }
    const g = this.grid;
    const B = M.bots;
    const lvl = e.botLevel === 2 ? B.medium : B.easy;
    const d = D(e);
    const cell = cellAt(g, e.x, e.y);
    if (cell < 0) return;
    let br = d.brain;
    if (!br) {
      br = d.brain = { target: -1, from: cell, detour: 0, hesitateUntil: 0, threatAt: 0, dashHeld: false, chase: 0, chaseFood: -1, lastX: e.x, lastY: e.y, lastCheck: now };
    }
    // застрягання: за 1.5 с майже не зрушили (поза паузою) - перерахувати ціль від поточної клітини
    if (now - br.lastCheck >= 1500) {
      if (now >= br.hesitateUntil && Math.hypot(e.x - br.lastX, e.y - br.lastY) < 14) br.target = -1;
      br.lastX = e.x;
      br.lastY = e.y;
      br.lastCheck = now;
    }
    if (now < br.hesitateUntil) {
      e.power = 0;
      e.wantDash = false;
      return;
    }
    // прибули в центр цілі (або цілі нема) - вибираємо наступну
    if (br.target < 0 || cell === br.target) {
      const [tcx, tcy] = br.target >= 0 ? cellCenter(g, br.target) : cellCenter(g, cell);
      if (br.target < 0 || Math.hypot(e.x - tcx, e.y - tcy) < 26) this.botDecide(e, br, cell, racers, now, lvl);
    }
    if (br.target < 0) {
      e.power = 0;
      return;
    }
    const [tx, ty] = cellCenter(g, br.target);
    // цілимось у центр клітини-цілі (проходи між центрами сусідніх клітин пряма лінія); повз поточну - у її центр, щоб не чіпляти кути
    let aimX = tx;
    let aimY = ty;
    if (cell !== br.target && cell !== br.from) {
      const [cx, cy] = cellCenter(g, cell);
      aimX = cx;
      aimY = cy;
    }
    if (br.chaseFood >= 0) {
      const f = this.food[br.chaseFood];
      if (f && f.respawnAt === 0 && f.cell === cell) {
        aimX = f.x;
        aimY = f.y;
      } else br.chaseFood = -1;
    }
    if (br.chase) {
      const prey = racers.find((o) => o.pid === br.chase);
      if (prey && prey.dissolveUntil <= 0 && cellAt(g, prey.x, prey.y) === cell) {
        aimX = prey.x;
        aimY = prey.y;
      } else br.chase = 0;
    }
    e.angle = Math.atan2(aimY - e.y, aimX - e.x);
    e.power = 1;
    // ривок на прямій: цільова й наступна клітини лежать на одній лінії з поточною
    let dash = false;
    if (e.dash.cdMs <= 0 && !br.dashHeld && br.detour === 0) {
      const n2 = this.descentStep(br.target);
      if (n2 >= 0 && cell === br.from) {
        const a = cellCenter(g, cell);
        const b = cellCenter(g, br.target);
        const c = cellCenter(g, n2);
        if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1) dash = true;
      }
    }
    br.dashHeld = dash;
    e.wantDash = dash;
  }

  /** Крок спуску за полем відстаней до фінішу (перший за порядком N,E,S,W); -1 - у фініші. */
  private descentStep(cell: number): number {
    const g = this.grid;
    const ns = openNeighbors(g, cell);
    let best = -1;
    for (const n of ns) if (g.dist[n] === g.dist[cell] - 1) {
      best = n;
      break;
    }
    return best;
  }

  private botDecide(e: RaceEntrant, br: Brain, cell: number, racers: RaceEntrant[], now: number, lvl: { mistake: number; delayMs: number }) {
    const g = this.grid;
    const B = M.bots;
    const ns = openNeighbors(g, cell).slice();
    const prev = br.from;
    br.from = cell;
    if (ns.length === 0) {
      br.target = -1;
      return;
    }
    // 1. середній тікає від важчих (з затримкою реакції)
    if (e.botLevel === 2) {
      const threat = this.nearest(e, racers, (o) => o.mass >= e.mass * C.eatRatio, B.eatRadius);
      if (threat) {
        if (br.threatAt === 0) br.threatAt = now;
        if (now - br.threatAt >= B.medium.fleeDelayMs) {
          const tc = cellAt(g, threat.x, threat.y);
          const far = this.bfsFarthest(cell, tc, ns);
          if (far >= 0) {
            br.target = far;
            br.detour = 0;
            return;
          }
        }
      } else br.threatAt = 0;
    }
    // 2. з'їсти придатну клітину поруч, якщо це не відводить від шляху більше ніж на eatDetourCells
    const prey = this.nearest(e, racers, (o) => o.protectUntil <= now && o.dissolveUntil <= 0 && e.mass >= o.mass * C.eatRatio, B.eatRadius);
    if (prey) {
      const pc = cellAt(g, prey.x, prey.y);
      if (pc >= 0 && g.dist[pc] <= g.dist[cell] + B.eatDetourCells) {
        const step = pc === cell ? -1 : this.stepToward(cell, pc, 6);
        if (step >= 0) {
          br.target = step;
          br.detour = 0;
          return;
        }
        if (pc === cell) {
          // у тій самій клітині лабіринту: женемося прямо на жертву
          br.target = cell;
          br.chase = prey.pid;
          return;
        }
      }
    }
    // 3. середній підбирає їжу не далі foodDetourCells клітин (у своїй клітині - іде прямо до шматка)
    if (e.botLevel === 2 && e.mass < M.maxMass - 0.5) {
      const here = this.foodByCell.get(cell)?.find((id) => this.food[id].respawnAt === 0);
      if (here !== undefined) {
        br.target = cell;
        br.chaseFood = here;
        br.detour = 0;
        return;
      }
      const f = this.nearestFoodStep(cell, B.foodDetourCells);
      if (f >= 0) {
        br.target = f;
        br.chaseFood = -1;
        br.detour = 0;
        return;
      }
    }
    // 4. «не туди» після помилки: ідемо далі від фінішу до глухого кута чи вичерпання глибини
    if (br.detour > 0) {
      const away = ns.filter((n) => n !== prev);
      if (away.length === 0) {
        br.detour = 0;
        br.target = prev >= 0 ? prev : ns[0];
        return;
      }
      br.detour--;
      br.target = away[Math.floor(this.rng() * away.length)];
      return;
    }
    // 5. спуск до фінішу; на розвилці (є вибір) - пауза-реакція і можлива помилка
    const forward = ns.filter((n) => n !== prev);
    const descent = this.descentStep(cell);
    if (descent < 0) {
      br.target = -1;
      return;
    }
    if (forward.length >= 2) {
      br.hesitateUntil = now + lvl.delayMs;
      if (this.rng() < lvl.mistake) {
        const wrong = forward.filter((n) => n !== descent);
        if (wrong.length) {
          br.target = wrong[Math.floor(this.rng() * wrong.length)];
          br.detour = 1 + Math.floor(this.rng() * 4);
          return;
        }
      }
    }
    br.target = descent;
  }

  private nearest(e: RaceEntrant, racers: RaceEntrant[], pred: (o: RaceEntrant) => boolean, radius: number): RaceEntrant | null {
    let best: RaceEntrant | null = null;
    let bd = radius;
    for (const o of racers) {
      if (o === e || o.dissolveUntil > 0 || !pred(o)) continue;
      const dd = Math.hypot(o.x - e.x, o.y - e.y);
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    return best;
  }

  /** Перший крок найкоротшого шляху від `from` до `to` у межах maxDepth (BFS по відкритих проходах); -1 - нема. */
  private stepToward(from: number, to: number, maxDepth: number): number {
    const g = this.grid;
    const prev = new Map<number, number>([[from, -1]]);
    let frontier = [from];
    for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
      const nextF: number[] = [];
      for (const c of frontier) {
        for (const n of openNeighbors(g, c)) {
          if (prev.has(n)) continue;
          prev.set(n, c);
          if (n === to) {
            let cur = n;
            while (prev.get(cur) !== from) cur = prev.get(cur) as number;
            return cur;
          }
          nextF.push(n);
        }
      }
      frontier = nextF;
    }
    return -1;
  }

  /** Сусід, що найдалі (за BFS) від клітини загрози. */
  private bfsFarthest(cell: number, threat: number, ns: number[]): number {
    const g = this.grid;
    if (threat < 0) return -1;
    const dist = new Map<number, number>([[threat, 0]]);
    let frontier = [threat];
    for (let depth = 1; depth <= 6 && frontier.length; depth++) {
      const nextF: number[] = [];
      for (const c of frontier) {
        for (const n of openNeighbors(g, c)) {
          if (dist.has(n)) continue;
          dist.set(n, depth);
          nextF.push(n);
        }
      }
      frontier = nextF;
    }
    let best = -1;
    let bd = -1;
    for (const n of ns) {
      const dd = dist.get(n) ?? 7;
      if (dd > bd) {
        bd = dd;
        best = n;
      }
    }
    void cell;
    return best;
  }

  /** Перший крок до найближчої їжі в межах maxDepth клітин (їжа не відводить від шляху далі, ніж на maxDepth); -1 - нема. */
  private nearestFoodStep(cell: number, maxDepth: number): number {
    const g = this.grid;
    const seen = new Map<number, number>([[cell, -1]]);
    let frontier = [cell];
    for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
      const nextF: number[] = [];
      for (const c of frontier) {
        const ids = this.foodByCell.get(c);
        if (ids && c !== cell && ids.some((id) => this.food[id].respawnAt === 0)) {
          let cur = c;
          while (seen.get(cur) !== cell && seen.get(cur) !== -1) cur = seen.get(cur) as number;
          return cur;
        }
        if (depth === maxDepth) continue;
        for (const n of openNeighbors(g, c)) {
          if (seen.has(n)) continue;
          seen.set(n, c);
          nextF.push(n);
        }
      }
      frontier = nextF;
    }
    return -1;
  }
}
