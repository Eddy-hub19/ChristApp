import {
  BTN_SPLIT,
  BTN_THROW,
  decodeBoard,
  decodeInput,
  decodeInputPacked,
  encodeInputPacked,
  decodeState,
  encodeBoard,
  encodeInput,
  encodeState,
  packetType,
  PKT_BOARD,
  PKT_STATE,
  type StateInput,
} from './protocol';

describe('бінарний протокол', () => {
  const state: StateInput = {
    tick: 123456,
    alive: true,
    total: 321.6,
    selfPid: 7,
    effects: [{ kind: 2, remainingMs: 4500 }],
    forgetChunks: [3, 4],
    chunks: [{ idx: 12, foods: [{ id: 1, x: 100.25, y: 200.5, kind: 2 }] }],
    foodEvents: [{ op: 1, id: 9, x: 5, y: 3000, kind: 1 }],
    players: [{ pid: 7, skin: 3, bot: false, name: 'Овечка Долі' }],
    cells: [{ id: 5, pid: 7, x: 1500.125, y: 99, mass: 1234, fx: 5 }],
    thorns: [{ id: 2, x: 10, y: 20, mass: 70 }],
    blobs: [{ id: 4, x: 1, y: 2 }],
    bonuses: [{ id: 3, kind: 6, x: 3199, y: 0.5 }],
    paused: [{ pid: 7, remainingMs: 12_300 }],
  };

  it('стан: encode -> decode без втрат (у межах квантування)', () => {
    const buf = encodeState(state);
    expect(packetType(buf)).toBe(PKT_STATE);
    const d = decodeState(buf);
    expect(d.tick).toBe(123456);
    expect(d.total).toBe(322);
    expect(d.effects).toEqual([{ kind: 2, remainingMs: 4500 }]);
    expect(d.forgetChunks).toEqual([3, 4]);
    expect(d.chunks[0].foods[0]).toEqual({
      id: 1,
      x: 100.25,
      y: 200.5,
      kind: 2,
    });
    expect(d.players[0].name).toBe('Овечка Долі');
    expect(d.cells[0]).toEqual({
      id: 5,
      pid: 7,
      x: 1500.125,
      y: 99,
      mass: 1234,
      fx: 5,
    });
    expect(d.bonuses[0].x).toBeCloseTo(3199, 1);
    expect(d.foodEvents[0].y).toBe(3000);
    expect(d.paused).toEqual([{ pid: 7, remainingMs: 12_300 }]);
  });

  it('вся арена в області видимості займає десятки-сотні байт, а не кілобайти', () => {
    const cells = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      pid: i,
      x: i * 10,
      y: i * 10,
      mass: 100,
      fx: 0,
    }));
    expect(encodeState({ ...state, cells }).length).toBeLessThan(500);
  });

  it('таблиця лідерів і мінікарта', () => {
    const buf = encodeBoard({
      top: [
        { pid: 1, mass: 99999, name: 'A' },
        { pid: 2, mass: 5, name: 'Ягня Сем' },
      ],
      alive: 31,
      map: [{ pid: 1, x: 10, y: 255, size: 40 }],
    });
    expect(packetType(buf)).toBe(PKT_BOARD);
    const d = decodeBoard(buf);
    expect(d.top[1]).toEqual({ pid: 2, mass: 5, name: 'Ягня Сем' });
    expect(d.map).toHaveLength(1);
    expect(d.map[0]).toEqual({ pid: 1, x: 10, y: 255, size: 40 });
  });

  it('ввід: кут, сила і кнопки туди-назад', () => {
    const msg = decodeInput(
      encodeInput(Math.PI / 2, 0.5, BTN_SPLIT | BTN_THROW),
    )!;
    expect(msg.angle).toBeCloseTo(Math.PI / 2, 1);
    expect(msg.power).toBeCloseTo(0.5, 1);
    expect(msg.split && msg.throw).toBe(true);
    expect(decodeInput(encodeInput(-1, 2, 0))!.power).toBe(1);
  });

  it('ввід: співвідношення сторін (4-й байт); старі клієнти без нього = квадрат', () => {
    expect(decodeInput(encodeInput(0, 1, 0, 2.2))!.aspect).toBeCloseTo(2.2, 1);
    expect(decodeInput(encodeInput(0, 1, 0))!.aspect).toBe(1);
    expect(decodeInput(Uint8Array.of(10, 20, 0))!.aspect).toBe(1);
  });

  it('ввід одним числом: туди-назад, у межах 26 біт, без бінарного вкладення', () => {
    const n = encodeInputPacked(Math.PI / 2, 0.5, BTN_SPLIT | BTN_THROW, 2.2);
    expect(Number.isInteger(n) && n >= 0 && n < 2 ** 26).toBe(true);
    const m = decodeInput(n)!;
    expect(m.angle).toBeCloseTo(Math.PI / 2, 1);
    expect(m.power).toBeCloseTo(0.5, 1);
    expect(m.split && m.throw).toBe(true);
    expect(m.aspect).toBeCloseTo(2.2, 1);
    expect(decodeInputPacked(-1)).toBeNull();
    expect(decodeInputPacked(NaN)).toBeNull();
    expect(decodeInputPacked(2 ** 40)).toBeNull();
    expect(typeof n).toBe('number'); // socket.io шле число одним текстовим кадром
  });

  it('сміття на вході не падає', () => {
    expect(decodeInput(null)).toBeNull();
    expect(decodeInput(new Uint8Array([1]))).toBeNull();
    expect(decodeInput(Uint8Array.of(1, 2, 255))!.split).toBe(true);
  });
});
