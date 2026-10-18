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
  it("ПК і телефон: мишка й палець («за пальцем») дають однакову силу, джойстик виходить на повну не пізніше", () => {
    // мишка й палець йдуть через одну й ту саму pointerDir; розгін на старті множить швидкість на сервері
    // (база × множник × сила), тому він однаковий для всіх способів керування
    const cx = 195;
    const cy = 400;
    for (const off of [0, 10, 14, 30, 50, 70, 120, 300]) {
      const mouse = pointerDir(cx + off, cy, cx, cy);
      const finger = pointerDir(cx, cy + off, cx, cy);
      expect(finger.power).toBeCloseTo(mouse.power, 10);
    }
    // з тим самим зсувом джойстик не повільніший за «за пальцем»
    for (const off of [8, 20, 40, 52, 70]) {
      expect(joystickDir(100 + off, 100, 100, 100).power).toBeGreaterThanOrEqual(pointerDir(195 + off, 400, 195, 400).power);
    }
    expect(joystickDir(100 + 52, 100, 100, 100).power).toBe(1);
    expect(pointerDir(195 + 52, 400, 195, 400).power).toBeLessThan(1);
  });
  it("ввід шлемо лише при зміні або за keepalive", () => {
    const d = { angle: 1, power: 1 };
    expect(inputChanged(null, d, 0)).toBe(true);
    expect(inputChanged(d, { angle: 1.01, power: 1 }, 50)).toBe(false);
    expect(inputChanged(d, { angle: 1.2, power: 1 }, 50)).toBe(true);
    expect(inputChanged(d, d, 500)).toBe(false);
    expect(inputChanged(d, d, 1000)).toBe(true);
    expect(inputChanged({ angle: 3.13, power: 1 }, { angle: -3.13, power: 1 }, 10)).toBe(false); // перехід через ±π
  });
});
