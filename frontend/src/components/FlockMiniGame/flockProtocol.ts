// Дзеркало backend/src/flock/protocol.ts - змінюйте обидва файли разом (тест flockProtocol.test.ts звіряє формат).
/**
 * Бінарний протокол "Отари". Файл навмисно без залежностей (тільки DataView),
 * щоб його можна було дзеркально використати на клієнті.
 *
 * Клієнт -> сервер, подія "i" (4 байти): u8 кут (0..255 = 0..2π), u8 сила (0..255), u8 кнопки (1=розділитись, 2=кинути),
 * u8 співвідношення сторін екрана ×64 (сервер підлаштовує форму області видимості; площа від нього не залежить).
 * Сервер -> клієнт: "s" (стан, тип 1) та "l" (таблиця лідерів + мінікарта, тип 2). Рідкісні події ("w","d","e") - JSON.
 */
export const PKT_STATE = 1;
export const PKT_BOARD = 2;
export const BTN_SPLIT = 1;
export const BTN_THROW = 2;

export const POS_SCALE = 16;
export const FX_SHIELD = 1;
export const FX_GHOST = 2;
export const FX_FROZEN = 4;
export const FX_SPEED = 8;
export const FX_MAGNET = 16;
/** Гравець у паузі (відключився, чекає повернення). */
export const FX_PAUSED = 32;

export const BONUS_CODE = [
  'speed',
  'magnet',
  'shield',
  'ghost',
  'double',
  'freeze',
  'golden',
] as const;

export interface DecodedFood {
  id: number;
  x: number;
  y: number;
  kind: number;
}
export interface DecodedState {
  tick: number;
  alive: boolean;
  total: number;
  selfPid: number;
  effects: { kind: number; remainingMs: number }[];
  forgetChunks: number[];
  chunks: { idx: number; foods: DecodedFood[] }[];
  foodEvents: (DecodedFood & { op: number })[];
  players: { pid: number; skin: number; bot: boolean; name: string }[];
  cells: {
    id: number;
    pid: number;
    x: number;
    y: number;
    mass: number;
    fx: number;
  }[];
  thorns: { id: number; x: number; y: number; mass: number }[];
  blobs: { id: number; x: number; y: number }[];
  bonuses: { id: number; kind: number; x: number; y: number }[];
  /** Таймери пауз гравців у зоні видимості (мс до зникнення). */
  paused: { pid: number; remainingMs: number }[];
}
export interface DecodedBoard {
  top: { pid: number; mass: number; name: string }[];
  /** Одна й та сама для всіх гравців (кодується раз). Місце гравця = індекс його pid у `map` (вона відсортована за масою). */
  alive: number;
  map: { pid: number; x: number; y: number; size: number }[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const MAX_PACKET = 1 << 18;
const scratch = new Uint8Array(MAX_PACKET);
const view = new DataView(scratch.buffer);

class W {
  o = 0;
  u8(v: number) {
    view.setUint8(this.o++, v & 255);
  }
  u16(v: number) {
    view.setUint16(this.o, v & 0xffff);
    this.o += 2;
  }
  u32(v: number) {
    view.setUint32(this.o, v >>> 0);
    this.o += 4;
  }
  pos(v: number) {
    this.u16(Math.max(0, Math.min(65535, Math.round(v * POS_SCALE))));
  }
  str(s: string) {
    const b = enc.encode(s).subarray(0, 40);
    this.u8(b.length);
    scratch.set(b, this.o);
    this.o += b.length;
  }
  out() {
    return scratch.slice(0, this.o);
  }
}

export interface StateInput {
  tick: number;
  alive: boolean;
  total: number;
  selfPid: number;
  effects: { kind: number; remainingMs: number }[];
  forgetChunks: number[];
  chunks: { idx: number; foods: DecodedFood[] }[];
  foodEvents: (DecodedFood & { op: number })[];
  players: { pid: number; skin: number; bot: boolean; name: string }[];
  cells: {
    id: number;
    pid: number;
    x: number;
    y: number;
    mass: number;
    fx: number;
  }[];
  thorns: { id: number; x: number; y: number; mass: number }[];
  blobs: { id: number; x: number; y: number }[];
  bonuses: { id: number; kind: number; x: number; y: number }[];
  /** Таймери пауз гравців у зоні видимості (мс до зникнення). */
  paused: { pid: number; remainingMs: number }[];
}

export function encodeState(s: StateInput): Uint8Array {
  const w = new W();
  w.u8(PKT_STATE);
  w.u32(s.tick);
  w.u8(s.alive ? 1 : 0);
  w.u16(Math.min(65535, Math.round(s.total)));
  w.u16(s.selfPid);
  w.u8(s.effects.length);
  for (const e of s.effects) {
    w.u8(e.kind);
    w.u16(Math.min(65535, Math.round(e.remainingMs / 100)));
  }
  w.u16(s.forgetChunks.length);
  for (const c of s.forgetChunks) w.u16(c);
  w.u16(s.chunks.length);
  for (const ch of s.chunks) {
    w.u16(ch.idx);
    w.u16(ch.foods.length);
    for (const f of ch.foods) {
      w.u16(f.id);
      w.pos(f.x);
      w.pos(f.y);
      w.u8(f.kind);
    }
  }
  w.u16(s.foodEvents.length);
  for (const f of s.foodEvents) {
    w.u8(f.op);
    w.u16(f.id);
    w.pos(f.x);
    w.pos(f.y);
    w.u8(f.kind);
  }
  w.u16(s.players.length);
  for (const p of s.players) {
    w.u16(p.pid);
    w.u8(p.skin);
    w.u8(p.bot ? 1 : 0);
    w.str(p.name);
  }
  w.u16(s.cells.length);
  for (const c of s.cells) {
    w.u16(c.id);
    w.u16(c.pid);
    w.pos(c.x);
    w.pos(c.y);
    w.u16(Math.min(65535, Math.round(c.mass)));
    w.u8(c.fx);
  }
  w.u16(s.thorns.length);
  for (const t of s.thorns) {
    w.u16(t.id);
    w.pos(t.x);
    w.pos(t.y);
    w.u16(Math.round(t.mass));
  }
  w.u16(s.blobs.length);
  for (const b of s.blobs) {
    w.u16(b.id);
    w.pos(b.x);
    w.pos(b.y);
  }
  w.u16(s.bonuses.length);
  for (const b of s.bonuses) {
    w.u16(b.id);
    w.u8(b.kind);
    w.pos(b.x);
    w.pos(b.y);
  }
  w.u16(s.paused.length);
  for (const p of s.paused) {
    w.u16(p.pid);
    w.u16(Math.min(65535, Math.round(p.remainingMs / 100)));
  }
  return w.out();
}

class R {
  o = 0;
  private v: DataView;
  private b: Uint8Array;
  constructor(buf: ArrayBuffer | Uint8Array) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.b = u8;
    this.v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  u8() {
    return this.v.getUint8(this.o++);
  }
  u16() {
    const x = this.v.getUint16(this.o);
    this.o += 2;
    return x;
  }
  u32() {
    const x = this.v.getUint32(this.o);
    this.o += 4;
    return x;
  }
  pos() {
    return this.u16() / POS_SCALE;
  }
  str() {
    const n = this.u8();
    const s = dec.decode(this.b.subarray(this.o, this.o + n));
    this.o += n;
    return s;
  }
}

export function packetType(buf: ArrayBuffer | Uint8Array) {
  return (buf instanceof Uint8Array ? buf : new Uint8Array(buf))[0];
}

export function decodeState(buf: ArrayBuffer | Uint8Array): DecodedState {
  const r = new R(buf);
  if (r.u8() !== PKT_STATE) throw new Error('not a state packet');
  const tick = r.u32();
  const alive = r.u8() === 1;
  const total = r.u16();
  const selfPid = r.u16();
  const effects = Array.from({ length: r.u8() }, () => ({
    kind: r.u8(),
    remainingMs: r.u16() * 100,
  }));
  const forgetChunks = Array.from({ length: r.u16() }, () => r.u16());
  const chunks = Array.from({ length: r.u16() }, () => {
    const idx = r.u16();
    const foods = Array.from({ length: r.u16() }, () => ({
      id: r.u16(),
      x: r.pos(),
      y: r.pos(),
      kind: r.u8(),
    }));
    return { idx, foods };
  });
  const foodEvents = Array.from({ length: r.u16() }, () => ({
    op: r.u8(),
    id: r.u16(),
    x: r.pos(),
    y: r.pos(),
    kind: r.u8(),
  }));
  const players = Array.from({ length: r.u16() }, () => ({
    pid: r.u16(),
    skin: r.u8(),
    bot: r.u8() === 1,
    name: r.str(),
  }));
  const cells = Array.from({ length: r.u16() }, () => ({
    id: r.u16(),
    pid: r.u16(),
    x: r.pos(),
    y: r.pos(),
    mass: r.u16(),
    fx: r.u8(),
  }));
  const thorns = Array.from({ length: r.u16() }, () => ({
    id: r.u16(),
    x: r.pos(),
    y: r.pos(),
    mass: r.u16(),
  }));
  const blobs = Array.from({ length: r.u16() }, () => ({
    id: r.u16(),
    x: r.pos(),
    y: r.pos(),
  }));
  const bonuses = Array.from({ length: r.u16() }, () => ({
    id: r.u16(),
    kind: r.u8(),
    x: r.pos(),
    y: r.pos(),
  }));
  const paused = Array.from({ length: r.u16() }, () => ({
    pid: r.u16(),
    remainingMs: r.u16() * 100,
  }));
  return {
    tick,
    alive,
    total,
    selfPid,
    effects,
    forgetChunks,
    chunks,
    foodEvents,
    players,
    cells,
    thorns,
    blobs,
    bonuses,
    paused,
  };
}

export function encodeBoard(b: DecodedBoard): Uint8Array {
  const w = new W();
  w.u8(PKT_BOARD);
  w.u8(b.top.length);
  for (const t of b.top) {
    w.u16(t.pid);
    w.u32(Math.round(t.mass));
    w.str(t.name);
  }
  w.u16(b.alive);
  w.u16(b.map.length);
  for (const m of b.map) {
    w.u16(m.pid);
    w.u8(m.x);
    w.u8(m.y);
    w.u8(m.size);
  }
  return w.out();
}

export function decodeBoard(buf: ArrayBuffer | Uint8Array): DecodedBoard {
  const r = new R(buf);
  if (r.u8() !== PKT_BOARD) throw new Error('not a board packet');
  const top = Array.from({ length: r.u8() }, () => ({
    pid: r.u16(),
    mass: r.u32(),
    name: r.str(),
  }));
  const alive = r.u16();
  const map = Array.from({ length: r.u16() }, () => ({
    pid: r.u16(),
    x: r.u8(),
    y: r.u8(),
    size: r.u8(),
  }));
  return { top, alive, map };
}

export function encodeInput(
  angle: number,
  power: number,
  buttons: number,
  /** ширина/висота екрана клієнта */
  aspect = 1,
): Uint8Array {
  const a =
    ((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) /
      (Math.PI * 2)) *
    256;
  return Uint8Array.of(
    Math.floor(a) & 255,
    Math.round(Math.max(0, Math.min(1, power)) * 255),
    buttons & 3,
    Math.max(1, Math.min(255, Math.round(aspect * 64))),
  );
}

/**
 * Ввід одним числом (кут 8 біт | сила 8 біт | кнопки 2 біти | екран 8 біт): socket.io шле таке одним
 * текстовим кадром, без бінарного вкладення (воно коштує вдвічі більше кадрів і розбору на сервері).
 */
export function encodeInputPacked(
  angle: number,
  power: number,
  buttons: number,
  aspect = 1,
): number {
  const b = encodeInput(angle, power, buttons, aspect);
  return b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 18);
}

export function decodeInputPacked(n: number) {
  if (!Number.isFinite(n) || n < 0 || n > 0x3ffffff) return null;
  const v = n | 0;
  return decodeInput(
    Uint8Array.of(v & 255, (v >> 8) & 255, (v >> 16) & 3, (v >> 18) & 255),
  );
}

export function decodeInput(
  buf: ArrayBuffer | Uint8Array | number | null | undefined,
): ReturnType<typeof decodeInputBytes> {
  if (typeof buf === 'number') return decodeInputPacked(buf);
  return decodeInputBytes(buf);
}

function decodeInputBytes(buf: ArrayBuffer | Uint8Array | null | undefined) {
  if (!buf) return null;
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 3) return null;
  return {
    angle: ((u8[0] + 0.5) / 256) * Math.PI * 2,
    power: u8[1] / 255,
    split: (u8[2] & BTN_SPLIT) !== 0,
    throw: (u8[2] & BTN_THROW) !== 0,
    /** Старі клієнти без 4-го байта = квадрат. */
    aspect: u8.length >= 4 && u8[3] > 0 ? u8[3] / 64 : 1,
  };
}
