import { describe, expect, it } from "vitest";
import { inputChanged, joystickDir, pointerDir } from "./flockInputMath";

describe("input math", () => {
  it("курсор біля клітини = стоїмо, далеко = повна швидкість", () => {
    expect(pointerDir(200, 200, 200, 200).power).toBe(0);
    expect(pointerDir(400, 200, 200, 200).power).toBe(1);
    expect(pointerDir(200, 100, 200, 200).angle).toBeCloseTo(-Math.PI / 2, 5);
  });
  it("джойстик: пропорційно зсуву, обмежено радіусом", () => {
    expect(joystickDir(126, 100, 100, 100, 52).power).toBeCloseTo(0.5, 5);
    expect(joystickDir(400, 100, 100, 100).power).toBe(1);
    expect(joystickDir(101, 100, 100, 100).power).toBe(0);
  });
  it("ввід шлемо лише при зміні або за keepalive", () => {
    const d = { angle: 1, power: 1 };
    expect(inputChanged(null, d, 0)).toBe(true);
    expect(inputChanged(d, { angle: 1.01, power: 1 }, 50)).toBe(false);
    expect(inputChanged(d, { angle: 1.2, power: 1 }, 50)).toBe(true);
    expect(inputChanged(d, d, 500)).toBe(true);
    expect(inputChanged({ angle: 3.13, power: 1 }, { angle: -3.13, power: 1 }, 10)).toBe(false); // перехід через ±π
  });
});
