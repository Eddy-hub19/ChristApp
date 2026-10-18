import { describe, expect, it } from "vitest";
import type { WhatsNewEntry } from "./flockWhatsNewData";
import { WHATS_NEW, WELCOME_ITEMS } from "./flockWhatsNewData";
import { decideAnnouncement, latestVersion, pendingEntries, type AnnounceInput } from "./flockWhatsNewLogic";

const mk = (version: number): WhatsNewEntry => ({
  version,
  date: "2026-01-01",
  items: [{ icon: "ruby", text: { ua: `u${version}`, ru: `r${version}`, en: `e${version}` } }],
});
const entries = [mk(1), mk(2), mk(3)];
const base: AnnounceInput = { serverSeen: 0, localSeen: 0, games: 5, status: "ready", resumable: false, entries };

describe("decideAnnouncement", () => {
  it("показывает новую версию игроку со стажем и не показывает повторно", () => {
    const first = decideAnnouncement({ ...base, serverSeen: 2 });
    expect(first).toMatchObject({ kind: "news", version: 3 });
    expect(decideAnnouncement({ ...base, serverSeen: 3 })).toBeNull();
  });

  it("запасной вариант: версия, сохранённая в localStorage, тоже считается просмотренной", () => {
    expect(decideAnnouncement({ ...base, serverSeen: 0, localSeen: 3 })).toBeNull();
  });

  it("объединяет пропущенные версии, новейшая сверху", () => {
    const a = decideAnnouncement(base);
    expect(a?.kind).toBe("news");
    if (a?.kind === "news") expect(a.entries.map((e) => e.version)).toEqual([3, 2, 1]);
  });

  it("не показывает во время игры, переподключения и на экране смерти", () => {
    for (const status of ["playing", "reconnecting", "dead", "resuming"] as const) {
      expect(decideAnnouncement({ ...base, status })).toBeNull();
    }
  });

  it("не показывает при возврате после вылета («Овечка чекає»)", () => {
    expect(decideAnnouncement({ ...base, resumable: true })).toBeNull();
  });

  it("новичку (ничего не видел, 0 игр) показывает приветствие вместо новшеств", () => {
    expect(decideAnnouncement({ ...base, games: 0 })).toEqual({ kind: "welcome", version: 3 });
    expect(decideAnnouncement({ ...base, games: 0, serverSeen: 3 })).toBeNull();
  });
});

describe("pendingEntries / данные", () => {
  it("pendingEntries отдаёт только новее просмотренной", () => {
    expect(pendingEntries(2, entries).map((e) => e.version)).toEqual([3]);
    expect(pendingEntries(3, entries)).toEqual([]);
  });

  it("версии в данных - целые, строго по возрастанию, у всех пунктов есть ua/ru/en", () => {
    WHATS_NEW.forEach((e, i) => {
      expect(Number.isInteger(e.version)).toBe(true);
      if (i > 0) expect(e.version).toBeGreaterThan(WHATS_NEW[i - 1].version);
      expect(e.items.length).toBeGreaterThanOrEqual(1);
    });
    expect(latestVersion()).toBe(WHATS_NEW[WHATS_NEW.length - 1].version);
    for (const it of [...WHATS_NEW.flatMap((e) => e.items), ...WELCOME_ITEMS]) {
      for (const l of ["ua", "ru", "en"] as const) expect(it.text[l].trim().length).toBeGreaterThan(0);
    }
    expect(WELCOME_ITEMS).toHaveLength(3);
  });
});
