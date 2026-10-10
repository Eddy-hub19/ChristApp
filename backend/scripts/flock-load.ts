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
import { initBot, thinkBot } from '../src/flock/flock.bots';
import { encodeInput } from '../src/flock/protocol';

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
  const mgr = new FlockManager((key, event, payload) => {
    const s = ns.sockets.get(key);
    if (!s) return;
    if (payload instanceof Uint8Array) {
      bytes += payload.length;
      s.volatile.emit(
        event,
        Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength),
      );
    } else s.emit(event, payload);
  });
  ns.on('connection', (s) => {
    s.on('j', (b: { skin?: number }) =>
      mgr.join(s.id, s.id, `Гравець ${s.id.slice(0, 3)}`, b?.skin ?? 0),
    );
    s.on('i', (buf: Uint8Array) => {
      if (!buf || buf.length < 3) return;
      const u8 = new Uint8Array(buf);
      mgr.input(
        s.id,
        ((u8[0] + 0.5) / 256) * Math.PI * 2,
        u8[1] / 255,
        !!(u8[2] & 1),
        !!(u8[2] & 2),
      );
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
  const stats = mgr.stats()[0];
  const perTick = cpuMs / (wall * HZ);
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
    s.on('s', () => {});
    s.on('d', () => s.emit('j', { skin: n % 12 }));
    // 20 повідомлень/с, іноді поворот / розділення / кидок
    setInterval(() => {
      if (Math.random() < 0.05) angle = Math.random() * 6.28;
      const btn = Math.random() < 0.01 ? 1 : Math.random() < 0.02 ? 2 : 0;
      s.emit('i', Buffer.from(encodeInput(angle, 1, btn)));
    }, 50);
    return s;
  });
  void sockets;
}

if (mode === 'sim') simMode();
else if (clientFlag)
  void netClients(); // дочірній процес: клієнти
else void netServer();
