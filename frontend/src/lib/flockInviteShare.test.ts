import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFlockInviteUrl, shareInvite } from "./flockInviteShare";

describe("flockInviteShare", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("посилання веде на конкретну арену й мову", () => {
    expect(buildFlockInviteUrl("https://app.test/", "ua", 3)).toBe("https://app.test/ua/games/flock?arena=3");
    expect(buildFlockInviteUrl("https://app.test", "en", null)).toBe("https://app.test/en/games/flock");
  });

  it("на телефоні використовує системне 'Поділитися'", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    expect(await shareInvite({ url: "u", title: "t", text: "x" })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ url: "u", title: "t", text: "x" });
  });

  it("скасування в системному меню - не помилка і не копіювання", async () => {
    const copy = vi.fn();
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new DOMException("x", "AbortError")),
      clipboard: { writeText: copy },
    });
    expect(await shareInvite({ url: "u", title: "t", text: "x" })).toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });

  it("без Web Share копіює посилання", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await shareInvite({ url: "https://x/y", title: "t", text: "x" })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://x/y");
  });

  it("якщо share впав не через скасування - падаємо на копіювання", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new Error("nope")), clipboard: { writeText } });
    expect(await shareInvite({ url: "u", title: "t", text: "x" })).toBe("copied");
  });
});
