import { describe, expect, it } from "vitest";
import { isFullscreenPath } from "./fullscreenRoutes";

describe("isFullscreenPath", () => {
  it("is true for game routes under /games/<name>", () => {
    expect(isFullscreenPath("/games/flock")).toBe(true);
    expect(isFullscreenPath("/games/flock/")).toBe(true);
    expect(isFullscreenPath("/games/snake")).toBe(true);
  });
  it("keeps the game list and other screens as is", () => {
    expect(isFullscreenPath("/games")).toBe(false);
    expect(isFullscreenPath("/chat")).toBe(false);
    expect(isFullscreenPath("/gamesx/flock")).toBe(false);
    expect(isFullscreenPath(undefined)).toBe(false);
  });
});
