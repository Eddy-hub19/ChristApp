/**
 * Нагрузочні сценарії: скільки запитів до БД і CPU коштує "Отара", Snake-дуель, чат і кінотеатр.
 * Клієнти повторюють поведінку фронтенду (heartbeat presence 20 с, activity 15 с, HTTP-опитування 30/45/60 с, ввід "Отари" 10/с).
 *
 * Потрібна ЛОКАЛЬНА (тимчасова) база: скрипт відмовиться працювати з будь-яким хостом, окрім localhost.
 *
 *   npm run build
 *   LOAD_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/christ?schema=public \
 *     node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/load-scenarios.ts <сценарій|all|probe> [секунд=40]
 *
 * Сценарії: idle, flock2, flock6, snake-duel, snake-classic, chat, cinema, mixed (Отара x6 + чат + кінотеатр).
 * probe - скільки запитів коштує одна подія кожного типу.
 *
 * Емуляція квоти CPU (CFS, як на Render): LOAD_QUOTA_MS=<мс на 100 мс> (50 = 0.5 vCPU; ділите на коефіцієнт повільності
 * ядра Render, див. scripts/cfs-throttle.c; бінарник - LOAD_THROTTLE_BIN).
 * Затримка до БД (як між регіонами): LOAD_DB_RTT_MS=<мс> - сервер ходить у базу через TCP-проксі з такою затримкою (RTT).
 * Результат у JSON: LOAD_OUT=<файл>. Інший збір бекенду (для порівняння "до/після"): LOAD_BACKEND_DIR=<каталог з dist/>.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
// Застарілі @types/socket.io-client (v1) перекривають типи v4 - беремо io через require, як у watch-party.gateway.spec.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { io } = require('socket.io-client') as {
  io: (url: string, opts?: Record<string, unknown>) => Socket;
};
type Socket = {
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  once: (event: string, cb: (...args: unknown[]) => void) => void;
  disconnect: () => void;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
import { encodeInputPacked } from '../src/flock/protocol';

const DB_URL = process.env.LOAD_DATABASE_URL ?? '';
const PORT = Number(process.env.LOAD_PORT ?? 3101);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'load-test-secret';
/** Каталог збірки бекенду (за замовчуванням цей; для порівняння "до" - worktree зі старим кодом). */
const BACKEND_DIR = process.env.LOAD_BACKEND_DIR ?? join(__dirname, '..');
const QUOTA_MS = Number(process.env.LOAD_QUOTA_MS ?? 0);
const THROTTLE_BIN =
  process.env.LOAD_THROTTLE_BIN ?? join(__dirname, 'cfs-throttle');
const LOG_FILE = process.env.LOAD_LOG ?? '/tmp/load-server.log';
const [scenarioArg = 'all', secondsArg] = process.argv.slice(2);
const DB_RTT_MS = Number(process.env.LOAD_DB_RTT_MS ?? 0);
const SECONDS = Number(secondsArg ?? 40);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type User = { id: string; username: string; token: string };
type Seed = {
  users: User[];
  admin: User;
  /** dm-кімната пари (2k, 2k+1) */
  dm: string[];
  watchRoom: string;
};

function assertLocal() {
  let host = '';
  try {
    host = new URL(DB_URL).hostname;
  } catch {
    /* нижче */
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(
      'LOAD_DATABASE_URL має вказувати на локальну базу (localhost/127.0.0.1).',
    );
    process.exit(2);
  }
}

async function seed(): Promise<Seed> {
  const db = new Client({
    connectionString: DB_URL.replace(/\?schema=.*$/, ''),
  });
  await db.connect();
  const mk = async (username: string): Promise<User> => {
    const found = await db.query('SELECT id FROM "User" WHERE username=$1', [
      username,
    ]);
    let id: string = found.rows[0]?.id;
    if (!id) {
      id = randomUUID();
      await db.query(
        'INSERT INTO "User"(id,email,username,password) VALUES ($1,$2,$3,$4)',
        [id, `${username}@load.test`, username, 'x'],
      );
    }
    return {
      id,
      username,
      token: jwt.sign({ sub: id }, SECRET, { expiresIn: '1d' }),
    };
  };
  const users: User[] = [];
  for (let i = 0; i < 12; i++) users.push(await mk(`load${i}`));
  const admin = await mk('neskai');
  const dm: string[] = [];
  for (let k = 0; k < 6; k++) {
    const [a, b] = [users[2 * k].id, users[2 * k + 1].id].sort();
    const title = `dm:${a}:${b}`;
    let room = (await db.query('SELECT id FROM "Room" WHERE title=$1', [title]))
      .rows[0]?.id;
    if (!room)
      room = (
        await db.query('INSERT INTO "Room"(title) VALUES ($1) RETURNING id', [
          title,
        ])
      ).rows[0].id;
    for (const u of [users[2 * k], users[2 * k + 1]]) {
      await db.query(
        'INSERT INTO "RoomMember"("roomId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [room, u.id],
      );
    }
    dm.push(room);
  }
  // кімната кінотеатру: хост load8, учасник load9
  let watchRoom = (
    await db.query('SELECT id FROM "WatchRoom" WHERE title=$1', ['load-cinema'])
  ).rows[0]?.id;
  if (!watchRoom) {
    watchRoom = randomUUID();
    await db.query(
      `INSERT INTO "WatchRoom"(id,title,provider,"videoId","hostId","inviteToken") VALUES ($1,'load-cinema','YOUTUBE','dQw4w9WgXcQ',$2,$3)`,
      [watchRoom, users[8].id, randomUUID()],
    );
  }
  for (const u of [users[8], users[9]]) {
    await db.query(
      `INSERT INTO "WatchRoomMember"("roomId","userId",status,"joinedAt") VALUES ($1,$2,'JOINED',now()) ON CONFLICT DO NOTHING`,
      [watchRoom, u.id],
    );
  }
  await db.end();
  return { users, admin, dm, watchRoom };
}

// ───────────── затримка до БД ─────────────
/** TCP-проксі до локальної БД, що додає RTT/2 у кожен бік (порядок байтів зберігається: однакова затримка). */
function startDelayProxy(
  targetUrl: string,
  rttMs: number,
): Promise<{ url: string; close: () => void }> {
  const target = new URL(targetUrl);
  const upstreamPort = Number(target.port || 5432);
  const upstreamHost = target.hostname;
  const delay = rttMs / 2;
  const pipe = (from: net.Socket, to: net.Socket) => {
    from.on('data', (chunk) =>
      setTimeout(() => !to.destroyed && to.write(chunk), delay),
    );
    from.on('end', () => setTimeout(() => to.end(), delay));
    from.on('error', () => to.destroy());
  };
  const srv = net.createServer((client) => {
    const upstream = net.connect(upstreamPort, upstreamHost);
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    pipe(client, upstream);
    pipe(upstream, client);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  return new Promise((resolve) =>
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      target.hostname = '127.0.0.1';
      target.port = String(port);
      resolve({ url: target.toString(), close: () => srv.close() });
    }),
  );
}

// ───────────── сервер ─────────────
let server: ChildProcess | null = null;
let throttler: ChildProcess | null = null;

async function startServer(dbUrl: string) {
  const out = openSync(LOG_FILE, 'w');
  server = spawn('node', ['dist/src/main.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      JWT_SECRET: SECRET,
      PORT: String(PORT),
      DB_QUERY_LOG: '1',
      NO_COLOR: '1',
      // не підтягувати backend/.env (там прод-секрети): уся конфігурація - з цього env
      DOTENV_CONFIG_PATH: '/dev/null',
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:3000',
    },
    stdio: ['ignore', out, out],
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/`);
      break;
    } catch {
      await sleep(500);
    }
  }
  if (QUOTA_MS > 0 && server.pid) {
    throttler = spawn(THROTTLE_BIN, [String(server.pid), String(QUOTA_MS)], {
      stdio: 'ignore',
    });
  }
  await sleep(1500);
}

function stopServer() {
  throttler?.kill();
  if (server?.pid) {
    try {
      process.kill(server.pid, 'SIGCONT');
    } catch {
      /* вже вийшов */
    }
  }
  server?.kill();
}

// ───────────── облік запитів з логу ─────────────
const queryLines = () => {
  const text = readFileSync(LOG_FILE, 'utf8');
  return text.split('\n').filter((l) => l.includes('[DbQuery]'));
};
type Counts = Record<string, { n: number; ms: number }>;
function countSince(
  from: number,
  to?: number,
): { total: number; byLabel: Counts } {
  const lines = queryLines().slice(from, to);
  const byLabel: Counts = {};
  for (const l of lines) {
    const m = /\[DbQuery\] (\d+(?:\.\d+)?)ms (.+)$/.exec(l);
    if (!m) continue;
    (byLabel[m[2]] ??= { n: 0, ms: 0 }).n += 1;
    byLabel[m[2]].ms += Number(m[1]);
  }
  return { total: lines.length, byLabel };
}

// ───────────── клієнти ─────────────
const timers: ReturnType<typeof setInterval>[] = [];
const sockets: Socket[] = [];
const every = (ms: number, fn: () => void) => {
  timers.push(setInterval(fn, ms));
};
function cleanup() {
  for (const t of timers.splice(0)) clearInterval(t);
  for (const s of sockets.splice(0)) s.disconnect();
}

const http = (u: User, path: string) =>
  fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${u.token}` },
  }).then((r) => r.text());

/** Основний чат-сокет + те, що фронтенд робить завжди: presence heartbeat і HTTP-опитування. */
async function chatClient(u: User, withBackgroundHttp = true): Promise<Socket> {
  const s = io(BASE, {
    auth: { token: u.token },
    transports: ['websocket'],
    forceNew: true,
  });
  sockets.push(s);
  await new Promise<void>((res, rej) => {
    s.once('connect', () => res());
    s.once('connect_error', rej);
  });
  s.emit('presence:state', { active: true });
  s.emit('presence:activity-sync');
  every(20_000, () => s.emit('presence:state', { active: true }));
  if (withBackgroundHttp) {
    every(30_000, () => void http(u, '/push/unread-summary'));
    every(45_000, () => void http(u, '/push/status'));
    every(60_000, () => void http(u, '/watch-rooms'));
  }
  return s;
}

function activity(s: Socket, roomId: string, game: string, mode?: string) {
  const send = () =>
    s.emit('presence:activity', { roomId, game, ...(mode ? { mode } : {}) });
  send();
  every(15_000, send);
}

async function flockClient(u: User): Promise<Socket> {
  const s = io(`${BASE}/flock`, {
    auth: { token: u.token },
    transports: ['websocket'],
    forceNew: true,
  });
  sockets.push(s);
  await new Promise<void>((res, rej) => {
    s.once('connect', () => res());
    s.once('connect_error', rej);
  });
  s.on('w', () => undefined);
  s.emit('j', { skin: 1 });
  let angle = Math.random() * 6;
  every(100, () => {
    if (Math.random() < 0.6) angle += (Math.random() - 0.5) * 1.2;
    s.emit('i', encodeInputPacked(angle, 1, 0, 1.8));
  });
  return s;
}

// ───────────── сценарії ─────────────
type Ctx = { seed: Seed };
const scenarios: Record<string, (c: Ctx) => Promise<void>> = {
  async idle({ seed }) {
    for (const u of seed.users.slice(0, 2)) await chatClient(u);
  },
  async flock2({ seed }) {
    for (const [i, u] of seed.users.slice(0, 2).entries()) {
      const s = await chatClient(u);
      activity(s, seed.dm[0], 'flock');
      await flockClient(u);
    }
  },
  async flock6({ seed }) {
    for (const [i, u] of seed.users.slice(0, 6).entries()) {
      const s = await chatClient(u);
      activity(s, seed.dm[Math.floor(i / 2)], 'flock');
      await flockClient(u);
    }
  },
  async 'snake-duel'({ seed }) {
    const room = seed.dm[0];
    const dirs = ['up', 'right', 'down', 'left'];
    for (const [i, u] of seed.users.slice(0, 2).entries()) {
      const s = await chatClient(u);
      s.emit('joinRoom', { roomId: room });
      s.emit('snake-session-sync', { roomId: room });
      activity(s, room, 'snake', 'duel');
      await sleep(300);
      s.emit('snake-level-select', { roomId: room, level: 1 });
      s.emit('snake-ready', { roomId: room, ready: true });
      every(250, () =>
        s.emit('snake-input', {
          roomId: room,
          dir: dirs[Math.floor(Math.random() * 4)],
        }),
      );
    }
  },
  async 'snake-classic'({ seed }) {
    const room = seed.dm[0];
    for (const u of seed.users.slice(0, 2)) {
      const s = await chatClient(u);
      s.emit('joinRoom', { roomId: room });
      s.emit('gameSync', { roomId: room, game: 'snake' });
      activity(s, room, 'snake', 'classic');
      let score = 0;
      every(70, () => {
        score += Math.random() < 0.05 ? 1 : 0;
        s.emit('snake-state', {
          roomId: room,
          state: {
            headX: 3,
            headY: 4,
            foodX: 8,
            foodY: 9,
            score,
            alive: true,
            body: [{ x: 2, y: 4 }],
          },
        });
      });
      every(1000, () => s.emit('snake-score', { roomId: room, score }));
    }
  },
  async chat({ seed }) {
    const room = seed.dm[1];
    const pair = seed.users.slice(2, 4);
    for (const [i, u] of pair.entries()) {
      const s = await chatClient(u);
      s.emit('joinRoom', { roomId: room });
      s.emit('roomViewState', { roomId: room, active: true });
      s.on('newMessage', () => s.emit('markRoomRead', { roomId: room }));
      every(1500, () => s.emit('roomTyping', { roomId: room, isTyping: true }));
      every(2500, () =>
        s.emit('sendMessage', {
          roomId: room,
          content: `hi ${i} ${Date.now()}`,
          clientMessageId: randomUUID(),
        }),
      );
    }
  },
  async cinema({ seed }) {
    for (const u of seed.users.slice(8, 10)) {
      const s = io(BASE, {
        auth: { token: u.token },
        transports: ['websocket'],
        forceNew: true,
      });
      sockets.push(s);
      await new Promise<void>((res, rej) => {
        s.once('connect', () => res());
        s.once('connect_error', rej);
      });
      s.emit('presence:state', { active: true });
      every(20_000, () => s.emit('presence:state', { active: true }));
      s.emit('watch:time', { t0: Date.now() });
      every(60_000, () => s.emit('watch:time', { t0: Date.now() }));
      s.emit('watch:join', { roomId: seed.watchRoom });
      await sleep(300);
      s.emit('watch:viewState', { roomId: seed.watchRoom, active: true });
      if (u.id === seed.users[8].id) {
        s.emit('watch:play', { roomId: seed.watchRoom, positionSec: 0 });
        let pos = 0;
        every(5000, () => {
          pos += 5;
          s.emit('watch:heartbeat', {
            roomId: seed.watchRoom,
            positionSec: pos,
            isPlaying: true,
          });
        });
      }
      every(7000, () =>
        s.emit('watch:message', {
          roomId: seed.watchRoom,
          text: `hey ${Date.now()}`,
        }),
      );
      every(30_000, () => s.emit('watch:markRead', { roomId: seed.watchRoom }));
    }
  },
  async mixed(c) {
    await scenarios.flock6(c);
    await scenarios.chat(c);
    await scenarios.cinema(c);
  },
};

// ───────────── probe: цена одной события ─────────────
async function probe(seed: Seed) {
  const [a, b] = seed.users;
  const room = seed.dm[0];
  const s = await chatClient(a, false);
  const s2 = await chatClient(b, false);
  s.emit('joinRoom', { roomId: room });
  s2.emit('joinRoom', { roomId: room });
  const w = io(BASE, {
    auth: { token: seed.users[8].token },
    transports: ['websocket'],
    forceNew: true,
  });
  sockets.push(w);
  await new Promise<void>((res) => w.once('connect', () => res()));
  w.emit('watch:join', { roomId: seed.watchRoom });
  const fl = await flockClient(seed.users[4]);
  await sleep(2000);
  const N = 10;
  const rows: { event: string; perEvent: number; labels: string }[] = [];
  const run = async (event: string, fire: () => void) => {
    const from = queryLines().length;
    for (let i = 0; i < N; i++) {
      fire();
      await sleep(40);
    }
    await sleep(400);
    const { total, byLabel } = countSince(from);
    rows.push({
      event,
      perEvent: Math.round((total / N) * 10) / 10,
      labels: Object.entries(byLabel)
        .map(([l, v]) => `${l}×${Math.round(v.n / N)}`)
        .join(', '),
    });
  };
  await run('presence:state (heartbeat)', () =>
    s.emit('presence:state', { active: true }),
  );
  await run('presence:activity (heartbeat)', () =>
    s.emit('presence:activity', { roomId: room, game: 'flock' }),
  );
  await run('presence:activity-sync', () => s.emit('presence:activity-sync'));
  await run('roomViewState', () =>
    s.emit('roomViewState', { roomId: room, active: true }),
  );
  await run('roomTyping', () =>
    s.emit('roomTyping', { roomId: room, isTyping: true }),
  );
  await run('markRoomRead', () => s.emit('markRoomRead', { roomId: room }));
  await run('gameSync', () =>
    s.emit('gameSync', { roomId: room, game: 'snake' }),
  );
  await run('snake-state (classic)', () =>
    s.emit('snake-state', {
      roomId: room,
      state: { headX: 1, headY: 1, foodX: 2, foodY: 2, score: 1, alive: true },
    }),
  );
  await run('snake-score (classic)', () =>
    s.emit('snake-score', { roomId: room, score: 1 }),
  );
  await run('snake-input (duel)', () =>
    s.emit('snake-input', { roomId: room, dir: 'up' }),
  );
  await run('flock input "i"', () =>
    fl.emit('i', encodeInputPacked(1, 1, 0, 1.8)),
  );
  await run('watch:time', () => w.emit('watch:time', { t0: Date.now() }));
  await run('watch:viewState', () =>
    w.emit('watch:viewState', { roomId: seed.watchRoom, active: true }),
  );
  await run('watch:heartbeat (host)', () =>
    w.emit('watch:heartbeat', {
      roomId: seed.watchRoom,
      positionSec: 5,
      isPlaying: true,
    }),
  );
  await run(
    'HTTP GET /push/unread-summary',
    () => void http(a, '/push/unread-summary'),
  );
  await run('HTTP GET /push/status', () => void http(a, '/push/status'));
  await run('HTTP GET /watch-rooms', () => void http(a, '/watch-rooms'));
  return rows;
}

// ───────────── запуск ─────────────
type ServerInfo = {
  history: {
    t: number;
    cpuPercent: number;
    loopLagP99Ms: number;
    loopLagMaxMs: number;
    dbPoolWaitingMax?: number;
    dbQueriesPerSec?: number;
  }[];
  db: { pingMs: number; pool: { total: number; max: number } };
};

async function runScenario(name: string, seed: Seed) {
  cleanup();
  await sleep(1500);
  const startedAt = Date.now();
  await scenarios[name]({ seed });
  await sleep(4000); // підключення, join, перші heartbeat - не рахуємо
  const markStart = queryLines().length;
  const t0 = Date.now();
  await sleep(SECONDS * 1000);
  const markEnd = queryLines().length;
  const t1 = Date.now();
  const { total, byLabel } = countSince(markStart, markEnd);
  const info = JSON.parse(
    await http(seed.admin, '/admin/server'),
  ) as ServerInfo;
  const hist = info.history.filter((h) => h.t >= t0 && h.t <= t1 + 5000);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const res = {
    scenario: name,
    seconds: SECONDS,
    queries: total,
    qps: Math.round((total / SECONDS) * 100) / 100,
    top: Object.entries(byLabel)
      .sort((x, y) => y[1].n - x[1].n)
      .slice(0, 6)
      .map(([l, v]) => ({
        label: l,
        qps: Math.round((v.n / SECONDS) * 100) / 100,
        avgMs: Math.round((v.ms / v.n) * 10) / 10,
      })),
    cpuPercentAvg: Math.round(avg(hist.map((h) => h.cpuPercent)) * 10) / 10,
    cpuPercentMax: Math.max(0, ...hist.map((h) => h.cpuPercent)),
    loopLagP99MaxMs: Math.max(0, ...hist.map((h) => h.loopLagP99Ms)),
    loopLagMaxMs: Math.max(0, ...hist.map((h) => h.loopLagMaxMs)),
    poolWaitingMax: Math.max(0, ...hist.map((h) => h.dbPoolWaitingMax ?? 0)),
    dbPingMs: info.db.pingMs,
    startedAt,
  };
  cleanup();
  return res;
}

async function main() {
  assertLocal();
  statSync(join(BACKEND_DIR, 'dist/src/main.js'));
  const seedData = await seed();
  const proxy = DB_RTT_MS > 0 ? await startDelayProxy(DB_URL, DB_RTT_MS) : null;
  await startServer(proxy?.url ?? DB_URL);
  const results: unknown[] = [];
  try {
    if (scenarioArg === 'probe') {
      const rows = await probe(seedData);
      console.table(rows);
      results.push(...rows);
    } else {
      const names =
        scenarioArg === 'all'
          ? [
              'idle',
              'flock2',
              'flock6',
              'snake-duel',
              'snake-classic',
              'chat',
              'cinema',
            ]
          : [scenarioArg];
      for (const n of names) {
        const r = await runScenario(n, seedData);
        console.log(JSON.stringify(r));
        results.push(r);
      }
    }
  } finally {
    cleanup();
    stopServer();
    proxy?.close();
  }
  if (process.env.LOAD_OUT)
    writeFileSync(process.env.LOAD_OUT, JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(1);
});
