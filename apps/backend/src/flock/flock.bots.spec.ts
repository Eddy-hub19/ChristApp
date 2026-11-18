import { FLOCK_CONFIG as C } from './flock.config';
import { BOT_NAMES, initBot, pickBotName, thinkBot } from './flock.bots';
import { CHUNKS_PER_SIDE, FlockWorld, type Player } from './flock.engine';

function world() {
  let s = 4; // сид подобран: тест чувствителен к случайной еде, что отрастает за тик
  const rng = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const w = new FlockWorld(rng);
  for (const m of w.foodChunks) m.clear();
  w.foodById.clear();
  w.thorns.length = 0;
  return { w, rng };
}

function bot(
  w: FlockWorld,
  rng: () => number,
  x: number,
  y: number,
  mass: number,
  personality: any = 'balanced',
): Player {
  const p = w.addPlayer({ name: 'bot', skin: 0, bot: true });
  p.effects = {};
  p.cells[0].x = x;
  p.cells[0].y = y;
  p.cells[0].mass = mass;
  initBot(p, rng, personality);
  (p.brain as any).offset = 0;
  return p;
}

function think(w: FlockWorld, p: Player, rng: () => number) {
  // доводимо тік до моменту, коли бот "думає" (offset 0)
  // поворот плавний (ліміт кута за думку): кілька думок поспіль доводять курс до бажаного
  for (let i = 0; i < 4; i++) {
    while (w.tickNo % C.botThinkEvery !== 0) w.tickNo++;
    thinkBot(w, p, rng);
  }
}

/** Бот бачить сусідів через сітку, а вона будується в tick(): робимо порожній тік. */
function prime(w: FlockWorld) {
  w.tick(0.0001);
}

describe('ШІ ботів', () => {
  it('тікає від більшого', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 50);
    const hunter = w.addPlayer({ name: 'h', skin: 1 });
    hunter.cells[0].x = 1700;
    hunter.cells[0].y = 1500;
    hunter.cells[0].mass = 400;
    prime(w);
    think(w, b, rng);
    // загроза праворуч -> бот їде ліворуч
    expect(Math.cos(b.angle)).toBeLessThan(-0.5);
  });

  it('полює на меншого (агресивний)', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 300, 'aggressive');
    const prey = w.addPlayer({ name: 'prey', skin: 1 });
    prey.spawnedAt = -1e9; // давно на арені: пільговий час новачка минув
    prey.effects = {};
    prey.cells[0].x = 1500;
    prey.cells[0].y = 1800;
    prey.cells[0].mass = 40;
    prime(w);
    think(w, b, rng);
    expect(Math.sin(b.angle)).toBeGreaterThan(0.8); // вниз (y росте)
  });

  it('не полює на людину-новачка, але полює, коли пільговий час минув', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 300, 'aggressive');
    const prey = w.addPlayer({ name: 'newbie', skin: 1 });
    prey.effects = {};
    prey.cells[0].x = 1500;
    prey.cells[0].y = 1800;
    prey.cells[0].mass = 40;
    prime(w);
    b.angle = 0;
    think(w, b, rng);
    expect(Math.sin(b.angle)).toBeLessThan(0.8); // не женеться вниз до новачка
    w.now += C.botGraceMs + 100;
    (b.brain as any).stuckAt = 0; // скачок часу без руху - не «застрягання»
    prime(w);
    think(w, b, rng);
    expect(Math.sin(b.angle)).toBeGreaterThan(0.8);
  });

  it('обережний не женеться за далекою здобиччю, а шукає їжу', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 300, 'cautious');
    const prey = w.addPlayer({ name: 'prey', skin: 1 });
    prey.spawnedAt = -1e9; // давно на арені: пільговий час новачка минув
    prey.effects = {};
    prey.cells[0].x = 1500;
    prey.cells[0].y = 1900; // 400 > huntRadius обережного
    prey.cells[0].mass = 40;
    const f = { id: 1, x: 1800, y: 1500, kind: 0 };
    w.foodById.set(1, f);
    w.foodChunks[
      Math.floor(1500 / C.chunkSize) * CHUNKS_PER_SIDE +
        Math.floor(1800 / C.chunkSize)
    ].set(1, f);
    prime(w);
    think(w, b, rng);
    expect(Math.cos(b.angle)).toBeGreaterThan(0.8); // до їжі праворуч
  });

  it('їде до найближчої їжі', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 40);
    const f = { id: 1, x: 1500, y: 1250, kind: 0 };
    w.foodById.set(1, f);
    w.foodChunks[
      Math.floor(1250 / C.chunkSize) * CHUNKS_PER_SIDE +
        Math.floor(1500 / C.chunkSize)
    ].set(1, f);
    prime(w);
    think(w, b, rng);
    expect(Math.sin(b.angle)).toBeLessThan(-0.8);
  });

  it('агресивний ділиться для атаки лише при високому шансі', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 400, 'aggressive');
    const prey = w.addPlayer({ name: 'prey', skin: 1 });
    prey.spawnedAt = -1e9; // давно на арені: пільговий час новачка минув
    prey.effects = {};
    prey.cells[0].x = 1500;
    prey.cells[0].y = 1640; // близько: шанс спіймати високий (дроблення лише тоді)
    prey.cells[0].mass = 60;
    prime(w);
    let split = false;
    for (let i = 0; i < 30 && !split; i++) {
      think(w, b, rng);
      split = b.wantSplit;
      b.wantSplit = false;
    }
    expect(split).toBe(true);
  });

  it('обережний ніколи не ділиться для атаки', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 400, 'cautious');
    const prey = w.addPlayer({ name: 'prey', skin: 1 });
    prey.spawnedAt = -1e9; // давно на арені: пільговий час новачка минув
    prey.effects = {};
    prey.cells[0].x = 1500;
    prey.cells[0].y = 1650;
    prey.cells[0].mass = 60;
    prime(w);
    for (let i = 0; i < 30; i++) {
      think(w, b, rng);
      expect(b.wantSplit).toBe(false);
    }
  });

  it("великий бот об'їжджає кущ", () => {
    const { w, rng } = world();
    const b = bot(w, rng, 1500, 1500, 500, 'balanced');
    w.thorns.push({ id: 1, x: 1560, y: 1500, mass: C.thornMass });
    prime(w);
    think(w, b, rng);
    expect(Math.cos(b.angle)).toBeLessThan(0.3); // не прямо в кущ
  });

  it('далеко від стін - не лізе в стіну', () => {
    const { w, rng } = world();
    const b = bot(w, rng, 60, 1500, 50);
    prime(w);
    think(w, b, rng);
    expect(Math.cos(b.angle)).toBeGreaterThan(-0.9);
  });

  it('ботів багато тіків поспіль не ламають світ', () => {
    const { w, rng } = world();
    const bots = Array.from({ length: 20 }, (_, i) =>
      bot(w, rng, 200 + i * 140, 200 + (i % 5) * 500, 40),
    );
    for (let i = 0; i < 600; i++) {
      for (const b of bots) if (b.alive) thinkBot(w, b, rng);
      w.tick(1 / C.tickHz);
    }
    for (const b of bots) {
      for (const c of b.cells) {
        expect(
          Number.isFinite(c.x) &&
            Number.isFinite(c.y) &&
            Number.isFinite(c.mass),
        ).toBe(true);
      }
    }
  });
});

describe('pickBotName', () => {
  const rng = () => 0.5;

  it('never repeats a name while free base names remain', () => {
    const taken: string[] = [];
    for (let i = 0; i < BOT_NAMES.length; i += 1) {
      const name = pickBotName(Math.random, taken);
      expect(taken).not.toContain(name);
      taken.push(name);
    }
    expect(new Set(taken).size).toBe(BOT_NAMES.length);
  });

  it('adds a number once all base names are taken', () => {
    const base = pickBotName(rng, BOT_NAMES);
    expect(base).toMatch(/ 2$/);
    expect(BOT_NAMES).toContain(base.replace(/ 2$/, ''));
    const third = pickBotName(rng, [...BOT_NAMES, base]);
    expect(third).toBe(base.replace(/ 2$/, ' 3'));
  });
});
