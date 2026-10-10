import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeBoard, decodeInput, decodeState, encodeBoard, encodeInput, encodeState, BTN_SPLIT, BTN_THROW } from "./flockProtocol";

describe("flockProtocol", () => {
  it("дзеркало бекенд-протоколу не розійшлось (крім першого рядка-коментаря)", () => {
    const front = readFileSync(resolve(__dirname, "flockProtocol.ts"), "utf8").split("\n").slice(1).join("\n");
    const back = readFileSync(resolve(__dirname, "../../../../backend/src/flock/protocol.ts"), "utf8");
    expect(front).toBe(back);
  });

  it("стан і лідерборд кодуються туди-назад", () => {
    const state = decodeState(
      encodeState({
        tick: 9,
        alive: true,
        total: 40,
        selfPid: 3,
        effects: [{ kind: 0, remainingMs: 2000 }],
        forgetChunks: [1],
        chunks: [{ idx: 2, foods: [{ id: 5, x: 10, y: 20, kind: 1 }] }],
        foodEvents: [{ op: 2, id: 5, x: 11, y: 21, kind: 1 }],
        players: [{ pid: 3, skin: 4, bot: true, name: "Ягня Сем" }],
        cells: [{ id: 1, pid: 3, x: 100, y: 200, mass: 55, fx: 2 }],
        thorns: [],
        blobs: [],
        bonuses: [{ id: 1, kind: 5, x: 5, y: 6 }],
        paused: [{ pid: 3, remainingMs: 9_800 }],
      }),
    );
    expect(state.players[0]).toEqual({ pid: 3, skin: 4, bot: true, name: "Ягня Сем" });
    expect(state.cells[0].mass).toBe(55);
    expect(state.paused).toEqual([{ pid: 3, remainingMs: 9_800 }]);
    const board = decodeBoard(encodeBoard({ top: [{ pid: 1, mass: 10, name: "A" }], selfRank: 1, alive: 2, map: [] }));
    expect(board.top[0].name).toBe("A");
  });

  it("ввід: кнопки й кут", () => {
    const m = decodeInput(encodeInput(1, 1, BTN_SPLIT | BTN_THROW));
    expect(m?.split && m?.throw).toBe(true);
  });
});
