import type { Skin } from "./flockSkins";

const TAU = Math.PI * 2;

// ---------- істоти ----------
export function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

function drawEyes(c: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, color: string, wolf: boolean) {
  const px = -Math.sin(ang);
  const py = Math.cos(ang);
  for (const side of [-1, 1]) {
    const ex = x + Math.cos(ang) * r * 0.12 + px * side * r * 0.2;
    const ey = y + Math.sin(ang) * r * 0.12 + py * side * r * 0.2;
    c.fillStyle = wolf ? color : "#ffffff";
    circle(c, ex, ey, r * (wolf ? 0.11 : 0.13));
    c.fill();
    c.fillStyle = "#16130f";
    circle(c, ex + Math.cos(ang) * r * 0.03, ey + Math.sin(ang) * r * 0.03, r * (wolf ? 0.05 : 0.075));
    c.fill();
    if (!wolf) {
      c.fillStyle = "#fff";
      circle(c, ex + r * 0.025, ey - r * 0.03, r * 0.025);
      c.fill();
    }
  }
}

export function drawCreature(c: CanvasRenderingContext2D, skin: Skin, x: number, y: number, r: number, ang: number, phase: number, wobble: number) {
  c.save();
  c.translate(x, y);
  // покачування: легкий нахил і "дихання"
  const sq = 1 + Math.sin(phase * 2) * 0.035 * wobble;
  c.rotate(Math.sin(phase) * 0.07 * wobble);
  c.scale(sq, 2 - sq);

  const fwdX = Math.cos(ang);
  const fwdY = Math.sin(ang);
  const dark = "rgba(0,0,0,0.16)";

  if (skin.kind === "wolf" || skin.kind === "dog") {
    // вуха
    c.fillStyle = skin.kind === "wolf" ? skin.fur : "#7a4a26";
    for (const side of [-1, 1]) {
      const a = ang + side * 1.05;
      const ex = Math.cos(a) * r * 0.72;
      const ey = Math.sin(a) * r * 0.72;
      if (skin.kind === "wolf") {
        c.beginPath();
        c.moveTo(ex + Math.cos(a + side * 0.9) * r * 0.32, ey + Math.sin(a + side * 0.9) * r * 0.32);
        c.lineTo(ex + Math.cos(a - side * 0.9) * r * 0.32, ey + Math.sin(a - side * 0.9) * r * 0.32);
        c.lineTo(Math.cos(a) * r * 1.14, Math.sin(a) * r * 1.14);
        c.closePath();
        c.fill();
      } else {
        c.beginPath();
        c.ellipse(ex, ey, r * 0.3, r * 0.2, a, 0, TAU);
        c.fill();
      }
    }
    c.fillStyle = skin.fur;
    circle(c, 0, 0, r);
    c.fill();
    c.fillStyle = skin.light;
    circle(c, -r * 0.22, -r * 0.28, r * 0.5);
    c.globalAlpha = 0.35;
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = Math.max(1, r * 0.06);
    c.strokeStyle = dark;
    circle(c, 0, 0, r);
    c.stroke();
    if (skin.kind === "dog") {
      c.fillStyle = skin.face;
      c.beginPath();
      c.ellipse(-fwdX * r * 0.25, -fwdY * r * 0.25, r * 0.55, r * 0.78, ang, 0, TAU);
      c.fill();
    }
    // морда
    c.fillStyle = skin.face;
    c.beginPath();
    c.ellipse(fwdX * r * 0.45, fwdY * r * 0.45, r * 0.42, r * 0.34, ang, 0, TAU);
    c.fill();
    drawEyes(c, fwdX * r * 0.1, fwdY * r * 0.1, r, ang, skin.accent, skin.kind === "wolf");
    c.fillStyle = "#1a1717";
    circle(c, fwdX * r * 0.78, fwdY * r * 0.78, r * 0.09);
    c.fill();
  } else {
    // вівця / ягня / баран: кучерява шерсть
    const bumps = skin.kind === "lamb" ? 9 : 11;
    const br = r * (skin.kind === "lamb" ? 0.3 : 0.27);
    c.fillStyle = dark;
    circle(c, r * 0.05, r * 0.07, r * 0.98);
    c.fill();
    c.fillStyle = skin.fur;
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * TAU + 0.2;
      circle(c, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, br);
      c.fill();
    }
    circle(c, 0, 0, r * 0.82);
    c.fill();
    c.fillStyle = skin.light;
    c.globalAlpha = 0.65;
    circle(c, -r * 0.2, -r * 0.25, r * 0.5);
    c.fill();
    c.globalAlpha = 1;
    if (skin.kind === "ram") {
      c.strokeStyle = skin.accent;
      c.lineWidth = Math.max(2, r * 0.13);
      c.lineCap = "round";
      for (const side of [-1, 1]) {
        const a = ang + side * 1.55;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.27, a - 1.6, a + 3.4);
        c.stroke();
      }
    }
    // вуха
    c.fillStyle = skin.face;
    for (const side of [-1, 1]) {
      const a = ang + side * 1.75;
      c.beginPath();
      c.ellipse(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.22, r * 0.12, a, 0, TAU);
      c.fill();
    }
    // мордочка
    c.fillStyle = skin.face;
    c.beginPath();
    c.ellipse(fwdX * r * 0.36, fwdY * r * 0.36, r * 0.46, r * 0.4, ang, 0, TAU);
    c.fill();
    drawEyes(c, fwdX * r * 0.2, fwdY * r * 0.2, r, ang, "#fff", false);
    c.fillStyle = skin.accent;
    circle(c, fwdX * r * 0.62, fwdY * r * 0.62, r * 0.08);
    c.fill();
    if (skin.kind === "lamb") {
      c.globalAlpha = 0.5;
      for (const side of [-1, 1]) {
        circle(c, fwdX * r * 0.38 - Math.sin(ang) * side * r * 0.34, fwdY * r * 0.38 + Math.cos(ang) * side * r * 0.34, r * 0.09);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }
  c.restore();
}

