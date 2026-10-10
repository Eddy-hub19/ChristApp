/**
 * Нагрузочний замір арени "Отара".
 *
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/flock-load.ts sim [humans=10] [bots=20] [hz=15] [ticks=3000]
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/flock-load.ts net [humans=10] [bots=20] [hz=15] [seconds=30]
 *
 * sim - чистий CPU-час тіка (рух, зіткнення, ШІ, кодування пакетів) без мережі.
 * net - справжній socket.io-сервер у цьому процесі + клієнти в дочірньому процесі;
 *       міряємо CPU серверного процесу (включно з socket.io) і трафік.
 *
 * Бюджет безкоштовного Render ~0.1 vCPU: арена має вкладатися приблизно в 1/3 нього.
 */
import { spawn } from 'child_process';
import { FLOCK_CONFIG } from '../src/flock/flock.config';
import { FlockManager } from '../src/flock/flock.manager';
import { createSender } from '../src/flock/flock.transport';
import { initBot, thinkBot } from '../src/flock/flock.bots';
import {
  decodeInput,
  encodeInput,
  encodeInputPacked,
} from '../src/flock/protocol';

const [mode = 'sim', humansArg, botsArg, hzArg, lastArg, clientFlag] =
  process.argv.slice(2);
const HUMANS = Number(humansArg ?? 10);
const BOTS = Number(botsArg ?? 20);
const HZ = Number(hzArg ?? 15);
const LAST = Number(lastArg ?? (mode === 'sim' ? 3000 : 30));
const CFG = FLOCK_CONFIG as unknown as Record<string, number>;
CFG.tickHz = HZ;
CFG.botTarget = BOTS;
CFG.botMin = Math.min(CFG.botMin, BOTS);
CFG.botTotalTarget = HUMANS + BOTS;

const BUDGET_CPU = 0.1; // Render free: ~0.1 vCPU
const pct = (a: number, b: number) => ((a / b) * 100).toFixed(1);
const quant = (arr: number[], q: number) =>
  [...arr].sort((a, b) => a - b)[Math.floor(arr.length * q)];

function report(
  label: string,
  msPerTickAvg: number,
  p95: number,
  p99: number,
  max: number,
  bytesPerSec: number,
  rssMb: number,
) {
  const cpuPerSec = msPerTickAvg * HZ; // мс CPU на секунду
  const onThisMachine = cpuPerSec / 1000;
  console.log(
    `\n=== ${label}: ${HUMANS} гравців + ${BOTS} ботів @ ${HZ} Гц ===`,
  );
  console.log(
    `CPU на тік: avg ${msPerTickAvg.toFixed(3)} мс, p95 ${p95.toFixed(3)}, p99 ${p99.toFixed(3)}, max ${max.toFixed(3)}`,
  );
  console.log(
    `Навантаження: ${cpuPerSec.toFixed(1)} мс CPU/с = ${pct(onThisMachine, 1)}% одного ядра на цій машині`,
  );
  for (const slow of [1, 3, 6]) {
    const frac = (onThisMachine * slow) / BUDGET_CPU;
    console.log(
      `  якщо ядро Render у ${slow}x повільніше за цю машину: ${pct(frac, 1)}% бюджету 0.1 vCPU ${frac <= 0.34 ? '(вкладається в 1/3)' : '(НЕ вкладається в 1/3)'}`,
    );
  }
  console.log(
    `Трафік (сервер -> усі): ${(bytesPerSec / 1024).toFixed(1)} КБ/с, на гравця ${(bytesPerSec / HUMANS / 1024).toFixed(2)} КБ/с`,
  );
  console.log(`RSS процесу: ${rssMb.toFixed(0)} МБ`);
}

function simMode() {
  let bytes = 0;
  const mgr = new FlockManager((_k, _e, payload) => {
    if (payload instanceof Uint8Array) bytes += payload.length;
  });
  for (let i = 0; i < HUMANS; i++)
    mgr.join(`c${i}`, `u${i}`, `Гравець ${i}`, i % 12);
  const arena = mgr._arena(1)!;
  const w = arena.world;
  const humans = [...w.players.values()].filter((p) => !p.bot);
  let seed = 5;
  const rng = () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const h of humans) initBot(h, rng); // "люди" керуються тим самим ШІ замість ввода
  // прогрів JIT
  for (let i = 0; i < 300; i++) {
    for (const h of humans) if (h.alive) thinkBot(w, h, rng);
    arena.step();
  }
  bytes = 0;
  const times: number[] = [];
  for (let i = 0; i < LAST; i++) {
    for (const h of humans) {
      if (!h.alive)
        mgr.join(`c${humans.indexOf(h)}`, `u${humans.indexOf(h)}`, 'x', 0);
      else thinkBot(w, h, rng);
    }
    const t0 = process.hrtime.bigint();
    arena.step();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const bytesPerSec = (bytes / LAST) * HZ;
  report(
    'sim (без мережі)',
    avg,
    quant(times, 0.95),
    quant(times, 0.99),
    Math.max(...times),
    bytesPerSec,
    process.memoryUsage().rss / 1048576,
  );
  const alive = [...w.players.values()].filter((p) => p.alive);
  const top = alive.sort((a, b) => b.total - a.total)[0];
  console.log(
    `(sanity) живих ${alive.length}/${w.players.size}, макс. маса ${top?.total.toFixed(0)}, їжі ${w.foodById.size}, клітин ${w.cellsById.size}`,
  );
  mgr.dispose();
}

async function netServer() {
  const { Server } = await import('socket.io');
  const io = new Server(0, {
    transports: ['websocket'],
    cors: { origin: '*' },
  });
  const ns = io.of('/flock');
  let bytes = 0;
  const sender = createSender((key) => ns.sockets.get(key));
  const mgr = new FlockManager((key, event, payload) => {
    if (payload instanceof Uint8Array) bytes += payload.length;
    sender(key, event, payload);
  });
  ns.on('connection', (s) => {
    s.on('j', (b: { skin?: number }) =>
      mgr.join(s.id, s.id, `Гравець ${s.id.slice(0, 3)}`, b?.skin ?? 0),
    );
    s.on('i', (body: number | Uint8Array) => {
      const m = decodeInput(body);
      if (m) mgr.input(s.id, m.angle, m.power, m.split, m.throw, m.aspect);
    });
    s.on('disconnect', () => mgr.leave(s.id));
  });
  const port = (io.httpServer.address() as { port: number }).port;
  const child = spawn(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      '-r',
      'tsconfig-paths/register',
      __filename,
      'net',
      String(HUMANS),
      String(BOTS),
      String(HZ),
      String(LAST),
      String(port),
    ],
    { stdio: 'inherit', env: process.env },
  );
  await new Promise((r) => setTimeout(r, 15000)); // клієнти підключаються, JIT/GC прогріваються
  const insp = process.env.FLOCK_PROF
    ? new (await import('inspector')).Session()
    : null;
  if (insp) {
    insp.connect();
    await new Promise<void>((r) =>
      insp.post('Profiler.enable', () =>
        insp.post('Profiler.start', () => r()),
      ),
    );
  }
  const { monitorEventLoopDelay } = await import('perf_hooks');
  const eld = monitorEventLoopDelay({ resolution: 5 });
  const snap0 = JSON.parse(JSON.stringify(mgr.stats()[0] ?? null));
  eld.enable();
  const cpu0 = process.cpuUsage();
  const bytes0 = bytes;
  const wall0 = Date.now();
  await new Promise((r) => setTimeout(r, LAST * 1000));
  const cpu = process.cpuUsage(cpu0);
  if (insp) {
    await new Promise<void>((r) =>
      insp.post('Profiler.stop', (_e, { profile }) => {
        require('fs').writeFileSync(
          process.env.FLOCK_PROF!,
          JSON.stringify(profile),
        );
        r();
      }),
    );
  }
  const wall = (Date.now() - wall0) / 1000;
  const cpuMs = (cpu.user + cpu.system) / 1000;
  eld.disable();
  const stats = mgr.stats()[0];
  const perTick = cpuMs / (wall * HZ);
  if (stats && snap0) {
    const n = stats.ticks - snap0.ticks;
    const ph = (k: 'think' | 'world' | 'encode' | 'send') =>
      (stats.phase[k] - snap0.phase[k]) / n;
    const lateN = stats.lateness.n - snap0.lateness.n;
    const pk = stats.packets - snap0.packets;
    console.log(
      `\n--- розбивка тіка (арена, мс/тік; ${n} тіків за ${wall.toFixed(0)} с) ---`,
    );
    console.log(
      `ШІ ботів ${ph('think').toFixed(3)} | світ ${ph('world').toFixed(3)} | кодування ${ph('encode').toFixed(3)} | socket.emit ${ph('send').toFixed(3)} | разом ${(ph('think') + ph('world') + ph('encode') + ph('send')).toFixed(3)}`,
    );
    console.log(
      `тіків/с: ${(n / wall).toFixed(2)} (ціль ${HZ}); запізнення таймера: avg ${((stats.lateness.sum - snap0.lateness.sum) / lateN).toFixed(2)} мс, max ${stats.lateness.max.toFixed(1)} мс, >50 мс: ${stats.lateness.over50 - snap0.lateness.over50} із ${lateN}`,
    );
    console.log(
      `event loop delay: mean ${(eld.mean / 1e6).toFixed(2)} мс, p99 ${(eld.percentile(99) / 1e6).toFixed(2)} мс, max ${(eld.max / 1e6).toFixed(1)} мс`,
    );
    console.log(
      `пакетів/с: ${(pk / wall).toFixed(1)} (на людину ${(pk / wall / HUMANS).toFixed(1)}), середній пакет ${((bytes - bytes0) / pk) | 0} Б`,
    );
  }
  report(
    `net (socket.io, CPU всього процесу; арена: ${stats?.humans} людей/${stats?.bots} ботів)`,
    perTick,
    perTick,
    perTick,
    perTick,
    (bytes - bytes0) / wall,
    process.memoryUsage().rss / 1048576,
  );
  child.kill();
  mgr.dispose();
  io.close();
  process.exit(0);
}

const T0 = Date.now();
const gaps: number[] = [];
async function netClients() {
  const mod: any = await import('socket.io-client');
  const io = mod.io ?? mod.default?.io ?? mod.default;
  const port = Number(clientFlag);
  const sockets = Array.from({ length: HUMANS }, (_, n) => {
    const s = io(`http://127.0.0.1:${port}/flock`, {
      transports: ['websocket'],
    });
    let angle = Math.random() * 6.28;
    s.on('connect', () => s.emit('j', { skin: n % 12 }));
    let lastAt = 0;
    s.on('s', () => {
      const now = Date.now();
      if (now - T0 > 15_000 && lastAt) gaps.push(now - lastAt);
      lastAt = now;
    });
    s.on('d', () => s.emit('j', { skin: n % 12 }));
    // Людина водить мишею/пальцем: кут міняється постійно. old = бінарний ввід 15/с (як було), new = число 10/с.
    const legacy = process.env.FLOCK_CLIENT_MODE === 'old';
    setInterval(
      () => {
        angle += (Math.random() - 0.5) * 0.4;
        const btn = Math.random() < 0.01 ? 1 : Math.random() < 0.02 ? 2 : 0;
        if (legacy) s.emit('i', Buffer.from(encodeInput(angle, 1, btn, 0.46)));
        else s.emit('i', encodeInputPacked(angle, 1, btn, 0.46));
      },
      legacy ? 66 : 100,
    );
    return s;
  });
  void sockets;
  // Підсумок інтервалів між пакетами стану, які бачить клієнт: це і є "плавність" з боку мережі/сервера.
  setTimeout(
    () => {
      const a = [...gaps].sort((x, y) => x - y);
      const q = (p: number) =>
        a[Math.min(a.length - 1, Math.floor(a.length * p))];
      const tick = 1000 / HZ;
      console.log(
        `\n--- інтервали між пакетами стану на клієнті (${a.length} шт; ціль ${tick.toFixed(0)} мс) ---\n` +
          `p50 ${q(0.5)} | p95 ${q(0.95)} | p99 ${q(0.99)} | max ${a[a.length - 1]} мс; пауз >2.5 тіка (${(tick * 2.5).toFixed(0)} мс): ${a.filter((x) => x > tick * 2.5).length} (${((a.filter((x) => x > tick * 2.5).length / a.length) * 100).toFixed(1)}%)`,
      );
    },
    (15 + LAST - 1) * 1000,
  );
}

if (mode === 'sim') simMode();
else if (clientFlag)
  void netClients(); // дочірній процес: клієнти
else void netServer();
