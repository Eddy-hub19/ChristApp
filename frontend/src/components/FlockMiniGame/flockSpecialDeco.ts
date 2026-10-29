import type { Skin, SkinDeco } from "./flockSkins";

/**
 * «Особливі» скіни (24..33, без анімації): кристальна, кактус, грибок, лавова, галактична, грозова, робот, суші, листочки, цукерка.
 * Малюються як і решта платних: базова вівця + прикраса в тих самих координатах (мордочка дивиться вздовж `ang`).
 * Частини, що виступають за тіло, - позаду (`drawSpecialBehind`) або поверх нього (`drawSpecialFront`).
 * Усе лише в кеш-спрайт: жодних анімацій і ніякого малювання на кадр.
 */
export const SPECIAL_DECOS: readonly SkinDeco[] = ["crystal", "cactus", "mushroom", "lava", "galaxy", "storm", "robot", "sushi", "leaves", "candy", "honey", "sky"];

export const isSpecialDeco = (d: SkinDeco | undefined): boolean => !!d && SPECIAL_DECOS.includes(d);

/** Половина сторони спрайта в радіусах тіла (виступи: кристали, капелюшок, антена, полум'я). */
export function specialExtent(skin: Skin): number {
  switch (skin.deco) {
    case "crystal":
      return 1.6;
    case "mushroom":
      return 1.45;
    case "lava":
    case "robot":
      return 1.5;
    case "storm":
    case "galaxy":
      return 1.4;
    case "leaves":
    case "honey":
    case "sky":
      return 1.4;
    case "candy":
      return 1.65;
    case "sushi":
    case "cactus":
      return 1.3;
    default:
      return 1.3;
  }
}

const TAU = Math.PI * 2;

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = 0.45) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** Точка в системі «вперед / вбік» (в радіусах тіла) -> координати полотна. */
function frame(r: number, ang: number) {
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const px = -fy;
  const py = fx;
  return {
    fx,
    fy,
    pt: (f: number, s: number): [number, number] => [(fx * f + px * s) * r, (fy * f + py * s) * r],
  };
}

const LEAF_COLORS = ["#d9531e", "#e8892a", "#f0b43a", "#b5381f", "#9a6a22"];

/** Листок: черешок в (0,0), кончик на +x на длину len; в центре жилка. */
function leaf(c: CanvasRenderingContext2D, x: number, y: number, dir: number, len: number, color: string) {
  c.save();
  c.translate(x, y);
  c.rotate(dir);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.25, -len * 0.42, len * 0.8, -len * 0.38, len, 0);
  c.bezierCurveTo(len * 0.8, len * 0.38, len * 0.25, len * 0.42, 0, 0);
  c.fill();
  c.strokeStyle = "rgba(80,30,10,0.45)";
  c.lineWidth = Math.max(0.8, len * 0.04);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(len * 0.9, 0);
  c.stroke();
  c.restore();
}

/** Обёртка-«хвостик» конфеты: два лепестка веером от точки (x, y) в направлении dir. */
function candyTwist(c: CanvasRenderingContext2D, x: number, y: number, dir: number, r: number) {
  c.save();
  c.translate(x, y);
  c.rotate(dir);
  for (const [fill, spread] of [
    ["#f2a0bf", 0.62],
    ["#ffc4d8", 0.5],
  ] as const) {
    c.fillStyle = fill;
    c.strokeStyle = "#d9709a";
    c.lineWidth = Math.max(1, r * 0.04);
    c.lineJoin = "round";
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(r * 0.25, side * r * spread * 0.9, r * 0.55, side * r * spread * 0.75);
      c.quadraticCurveTo(r * 0.62, side * r * 0.05, 0, 0);
      c.fill();
      c.stroke();
    }
  }
  c.restore();
}

function heart(c: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.moveTo(0, size * 0.35);
  c.bezierCurveTo(-size * 0.95, -size * 0.2, -size * 0.45, -size * 0.85, 0, -size * 0.3);
  c.bezierCurveTo(size * 0.45, -size * 0.85, size * 0.95, -size * 0.2, 0, size * 0.35);
  c.closePath();
  c.restore();
}

/** Шестиугольник (сота) с центром (x, y) и радиусом rr, повёрнут на rot. */
function hexagon(c: CanvasRenderingContext2D, x: number, y: number, rr: number, rot: number) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * Math.PI) / 3;
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** Капля: круглое тело в (x, y) и острый кончик в сторону dir. */
function drop(c: CanvasRenderingContext2D, x: number, y: number, dir: number, rr: number) {
  c.beginPath();
  c.arc(x, y, rr, dir + 0.6, dir + TAU - 0.6);
  c.lineTo(x + Math.cos(dir) * rr * 2.1, y + Math.sin(dir) * rr * 2.1);
  c.closePath();
}

/** Маленькое облачко из трёх кругов с центром (x, y). */
function puffCloud(c: CanvasRenderingContext2D, x: number, y: number, rr: number, fill: string, shade: string) {
  for (const [col, dy] of [
    [shade, 0.1],
    [fill, 0],
  ] as const) {
    c.fillStyle = col;
    for (const [dx, k] of [
      [-0.7, 0.75],
      [0, 1],
      [0.7, 0.75],
    ] as const) {
      circle(c, x + dx * rr, y + dy * rr + (1 - k) * rr * 0.4, rr * k * 0.7);
      c.fill();
    }
  }
}

function spiral(c: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
  c.beginPath();
  for (let t = 0; t <= 3.2 * Math.PI; t += 0.2) {
    const rad = (t / (3.2 * Math.PI)) * size;
    const px = x + Math.cos(t + rot) * rad;
    const py = y + Math.sin(t + rot) * rad;
    if (t === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.stroke();
}

function flame(c: CanvasRenderingContext2D, x: number, y: number, dir: number, len: number, w: number, outer: string, inner: string) {
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  const vx = -uy;
  const vy = ux;
  for (const [k, col] of [
    [1, outer],
    [0.55, inner],
  ] as const) {
    const l = len * k;
    const ww = w * k;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - vx * ww, y - vy * ww);
    c.bezierCurveTo(x - vx * ww + ux * l * 0.5, y - vy * ww + uy * l * 0.5, x + ux * l * 0.7 - vx * ww * 0.2, y + uy * l * 0.7 - vy * ww * 0.2, x + ux * l, y + uy * l);
    c.bezierCurveTo(x + ux * l * 0.7 + vx * ww * 0.2, y + uy * l * 0.7 + vy * ww * 0.2, x + vx * ww + ux * l * 0.5, y + vy * ww + uy * l * 0.5, x + vx * ww, y + vy * ww);
    c.closePath();
    c.fill();
  }
}

function miniMushroom(c: CanvasRenderingContext2D, x: number, y: number, dir: number, r: number) {
  c.save();
  c.translate(x, y);
  c.rotate(dir);
  // +x - «вгору» грибка (від тіла назовні)
  c.fillStyle = "#f3e2cf";
  c.fillRect(0, -r * 0.09, r * 0.24, r * 0.18);
  c.fillStyle = "#d6414a";
  c.beginPath();
  c.ellipse(r * 0.26, 0, r * 0.15, r * 0.26, 0, 0, TAU);
  c.fill();
  c.fillStyle = "#f8e4d3";
  circle(c, r * 0.3, -r * 0.09, r * 0.045);
  c.fill();
  circle(c, r * 0.27, r * 0.1, r * 0.035);
  c.fill();
  c.restore();
}

/** Частини, що виступають ПОЗАД тілом. */
export function drawSpecialBehind(c: CanvasRenderingContext2D, skin: Skin, r: number, ang: number) {
  switch (skin.deco) {
    case "crystal": {
      // кластер кристалів ззаду-збоку: [кут від «назад», піврозмір основи, довжина, колір]
      const spec: [number, number, number, number][] = [
        [-1.45, 0.13, 0.6, 1],
        [-0.95, 0.19, 0.95, 0],
        [-0.45, 0.22, 1.05, 1],
        [0.05, 0.16, 0.75, 2],
        [0.55, 0.13, 0.5, 0],
      ];
      const cols = [
        ["#a9caff", "#e3f0ff"],
        ["#b7a3f4", "#e9e0ff"],
        ["#8fb8f0", "#d6e8ff"],
      ];
      for (const [off, hw, len, ci] of spec) {
        const a = ang + Math.PI + off;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const vx = -uy;
        const vy = ux;
        const P = (d: number, s: number): [number, number] => [(ux * d + vx * s) * r, (uy * d + vy * s) * r];
        const pts = [P(0.55, -hw), P(0.55, hw), P(0.55 + len * 0.7, hw * 0.95), P(0.7 + len * 0.8, 0), P(0.55 + len * 0.7, -hw * 0.95)];
        c.fillStyle = cols[ci][0];
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fill();
        // світла грань
        c.fillStyle = cols[ci][1];
        c.globalAlpha = 0.85;
        c.beginPath();
        const mid = P(0.55, 0);
        c.moveTo(mid[0], mid[1]);
        c.lineTo(pts[3][0], pts[3][1]);
        c.lineTo(pts[4][0], pts[4][1]);
        c.lineTo(pts[0][0], pts[0][1]);
        c.closePath();
        c.fill();
        c.globalAlpha = 1;
        c.strokeStyle = "rgba(90,80,160,0.4)";
        c.lineWidth = Math.max(1, r * 0.035);
        c.lineJoin = "round";
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.stroke();
      }
      break;
    }
    case "storm": {
      // хмарні "купи" ззаду й по боках
      const { pt } = frame(r, ang);
      const puffs: [number, number, number][] = [
        [-0.95, -0.55, 0.3],
        [-1.05, 0.15, 0.32],
        [-0.8, 0.75, 0.28],
        [-0.15, -1.0, 0.25],
        [0.1, 1.0, 0.22],
      ];
      c.fillStyle = "#d3d9e3";
      for (const [f, s, rr] of puffs) {
        const [x, y] = pt(f, s);
        circle(c, x + r * 0.03, y + r * 0.04, rr * r);
        c.fill();
      }
      c.fillStyle = "#f4f6fa";
      for (const [f, s, rr] of puffs) {
        const [x, y] = pt(f, s);
        circle(c, x, y, rr * r);
        c.fill();
      }
      break;
    }
    case "candy": {
      // обёртка по бокам тела (перпендикулярно взгляду)
      for (const side of [-1, 1]) {
        const a = ang + side * (Math.PI / 2);
        candyTwist(c, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, a, r * 0.95);
      }
      break;
    }
    case "honey": {
      // соты позади и по бокам: три шестиугольника
      const { pt } = frame(r, ang);
      for (const [f, s2, rr] of [
        [-1.0, -0.45, 0.3],
        [-1.05, 0.2, 0.3],
        [-0.65, 0.85, 0.27],
        [-0.45, -1.0, 0.26],
      ] as const) {
        const [x, y] = pt(f, s2);
        hexagon(c, x, y, rr * r, ang);
        c.fillStyle = "#f2b43a";
        c.fill();
        c.strokeStyle = "#b9791a";
        c.lineWidth = Math.max(1, r * 0.045);
        c.lineJoin = "round";
        c.stroke();
        hexagon(c, x, y, rr * r * 0.55, ang);
        c.fillStyle = "#ffe08a";
        c.fill();
      }
      break;
    }
    case "sky": {
      // облачка позади и по бокам
      const { pt } = frame(r, ang);
      for (const [f, s2, rr] of [
        [-0.95, -0.5, 0.34],
        [-1.0, 0.35, 0.36],
        [-0.2, -1.0, 0.27],
        [0.05, 1.0, 0.25],
      ] as const) {
        const [x, y] = pt(f, s2);
        puffCloud(c, x, y, rr * r, "#ffffff", "#cfdff2");
      }
      break;
    }
    case "leaves": {
      // листочки, що стирчать позаду й по боках
      for (let i = 0; i < 9; i++) {
        const a = ang + Math.PI + (i - 4) * 0.5;
        const l = r * (0.5 + (i % 3) * 0.1);
        leaf(c, Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, a + ((i % 2) - 0.5) * 0.6, l, LEAF_COLORS[i % LEAF_COLORS.length]);
      }
      break;
    }
    case "robot": {
      // антена з помаранчевою кулькою
      const { pt } = frame(r, ang);
      const [x0, y0] = pt(-0.75, -0.25);
      const [x1, y1] = pt(-1.25, -0.42);
      c.strokeStyle = "#8d8a86";
      c.lineWidth = Math.max(1.5, r * 0.06);
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.fillStyle = "#ff8240";
      circle(c, x1, y1, r * 0.14);
      c.fill();
      c.fillStyle = "#ffc299";
      circle(c, x1 - r * 0.04, y1 - r * 0.04, r * 0.045);
      c.fill();
      break;
    }
  }
}

/** Прикраси поверх тіла й мордочки. */
export function drawSpecialFront(c: CanvasRenderingContext2D, skin: Skin, r: number, ang: number) {
  const { pt } = frame(r, ang);
  const line = Math.max(1, r * 0.03);
  switch (skin.deco) {
    case "crystal": {
      // дрібні кристали на самій шерсті біля основи кластера
      for (const [off, d, len, light] of [
        [-0.75, 0.5, 0.42, "#c4adf7"],
        [-0.2, 0.55, 0.36, "#a9caff"],
        [0.3, 0.45, 0.28, "#d6c8fb"],
      ] as const) {
        const a = ang + Math.PI + off;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const vx = -uy;
        const vy = ux;
        const w = r * 0.09;
        const bx = ux * r * d;
        const by = uy * r * d;
        c.fillStyle = light;
        c.beginPath();
        c.moveTo(bx - vx * w, by - vy * w);
        c.lineTo(bx + vx * w, by + vy * w);
        c.lineTo(bx + ux * r * len * 0.7 + vx * w * 0.8, by + uy * r * len * 0.7 + vy * w * 0.8);
        c.lineTo(bx + ux * r * len, by + uy * r * len);
        c.lineTo(bx + ux * r * len * 0.7 - vx * w * 0.8, by + uy * r * len * 0.7 - vy * w * 0.8);
        c.closePath();
        c.fill();
        c.strokeStyle = "rgba(90,80,160,0.4)";
        c.lineWidth = line;
        c.lineJoin = "round";
        c.stroke();
      }
      break;
    }
    case "hearts":
    case "mint": {
      const { pt } = frame(r, ang);
      if (skin.deco === "hearts") {
        // [вперёд, вбок, размер, залитое, поворот]
        for (const [f, sd, sz, filled, rot] of [
          [-0.55, -0.35, 0.2, 1, -0.4],
          [-0.2, -0.72, 0.15, 0, 0.5],
          [-0.75, 0.2, 0.17, 0, 0.3],
          [-0.4, 0.62, 0.22, 1, 0.6],
          [0.05, 0.72, 0.13, 0, -0.5],
          [0.1, -0.7, 0.16, 1, 0.2],
          [-0.95, -0.05, 0.12, 1, -0.2],
          [-0.15, 0.2, 0.1, 0, 0.1],
        ] as const) {
          const [x, y] = pt(f, sd);
          heart(c, x, y, sz * r, ang + rot);
          if (filled) {
            c.fillStyle = "#d9232b";
            c.fill();
          } else {
            c.strokeStyle = "#e0343a";
            c.lineWidth = Math.max(1, r * 0.035);
            c.lineJoin = "round";
            c.stroke();
          }
        }
      } else {
        c.strokeStyle = "#ffffff";
        c.lineCap = "round";
        c.lineWidth = Math.max(1, r * 0.05);
        for (const [f, sd, sz, rot] of [
          [-0.45, -0.3, 0.2, 0],
          [-0.15, -0.72, 0.13, 2],
          [-0.8, 0.25, 0.16, 4],
          [-0.35, 0.65, 0.18, 1],
          [0.15, 0.7, 0.12, 3],
          [0.1, -0.68, 0.14, 5],
          [-0.95, -0.15, 0.1, 2.5],
        ] as const) {
          const [x, y] = pt(f, sd);
          spiral(c, x, y, sz * r, rot);
        }
      }
      // розовая щёчка сбоку мордочки (носик под ней закрываем цветом мордочки)
      c.fillStyle = skin.face;
      const [nx, ny] = pt(0.62, 0);
      circle(c, nx, ny, r * 0.1);
      c.fill();
      c.fillStyle = skin.accent;
      const [kx, ky] = pt(0.5, 0.26);
      circle(c, kx, ky, r * 0.08);
      c.fill();
      break;
    }
    case "candy": {
      // розовая спираль на теле, мордочка остаётся чистой (evenodd-вырез под неё)
      const { fx, fy } = frame(r, ang);
      c.save();
      c.beginPath();
      c.arc(0, 0, r * 0.9, 0, TAU);
      c.ellipse(fx * r * 0.36, fy * r * 0.36, r * 0.5, r * 0.44, ang, 0, TAU);
      c.clip("evenodd");
      c.strokeStyle = "#f6a9c4";
      c.lineWidth = r * 0.13;
      c.lineCap = "round";
      c.beginPath();
      const cx0 = -r * 0.15;
      const cy0 = -r * 0.2;
      for (let t = 0; t <= 3 * TAU; t += 0.15) {
        const rad = (t / (3 * TAU)) * r * 1.5;
        const px = cx0 + Math.cos(t + ang) * rad;
        const py = cy0 + Math.sin(t + ang) * rad;
        if (t === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      c.restore();
      break;
    }
    case "honey": {
      // капли мёда на шерсти и сотовая «шапочка» на макушке
      const [cx, cy] = pt(-0.45, 0);
      hexagon(c, cx, cy, r * 0.27, ang);
      c.fillStyle = "#f2b43a";
      c.fill();
      c.strokeStyle = "#b9791a";
      c.lineWidth = Math.max(1, r * 0.05);
      c.lineJoin = "round";
      c.stroke();
      hexagon(c, cx, cy, r * 0.14, ang);
      c.fillStyle = "#ffe08a";
      c.fill();
      for (const [f, s2, dir, rr] of [
        [-0.1, -0.6, 2.2, 0.09],
        [-0.7, 0.45, 1.2, 0.1],
        [-0.15, 0.62, 1.0, 0.075],
        [-0.85, -0.3, 2.9, 0.08],
      ] as const) {
        const [x, y] = pt(f, s2);
        drop(c, x, y, ang + dir, rr * r);
        c.fillStyle = "#f0a21f";
        c.fill();
        c.fillStyle = "rgba(255,240,190,0.85)";
        circle(c, x - rr * r * 0.3, y - rr * r * 0.3, rr * r * 0.3);
        c.fill();
      }
      break;
    }
    case "sky": {
      // радуга дугой над макушкой и крошечное облачко
      const [cx, cy] = pt(-0.5, 0);
      c.lineCap = "round";
      ["#ff6b6b", "#ffb84a", "#ffe45c", "#6fd38a", "#5aa9ff", "#9a7bf0"].forEach((col, i) => {
        c.strokeStyle = col;
        c.lineWidth = Math.max(1, r * 0.06);
        c.beginPath();
        c.arc(cx, cy, r * (0.4 - i * 0.055), ang + Math.PI * 0.5, ang + Math.PI * 1.5);
        c.stroke();
      });
      const [px, py] = pt(-0.78, 0.5);
      puffCloud(c, px, py, r * 0.17, "#ffffff", "#cfdff2");
      break;
    }
    case "leaves": {
      // листочки на шерсті й вінок з листя на маківці
      for (const [f, s2, rot, len, k] of [
        [-0.2, -0.55, 0.6, 0.42, 0],
        [-0.55, 0.4, -0.9, 0.4, 1],
        [-0.1, 0.55, 2.2, 0.36, 2],
        [-0.8, -0.2, 3.4, 0.38, 3],
        [0.05, -0.05, 1.3, 0.3, 4],
      ] as const) {
        const [x, y] = pt(f, s2);
        leaf(c, x, y, ang + rot, r * len, LEAF_COLORS[k]);
      }
      const [cx, cy] = pt(-0.45, 0);
      for (let k = 0; k < 6; k++) {
        const a = ang + (k / 6) * TAU;
        leaf(c, cx + Math.cos(a) * r * 0.08, cy + Math.sin(a) * r * 0.08, a, r * 0.3, LEAF_COLORS[(k + 1) % LEAF_COLORS.length]);
      }
      break;
    }
    case "cactus": {
      // голки по краю
      c.strokeStyle = "#f4eec4";
      c.lineWidth = line;
      c.lineCap = "round";
      for (let i = 0; i < 18; i++) {
        const a = ang + 0.9 + (i / 18) * (TAU - 1.8);
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
        c.lineTo(Math.cos(a) * r * (1.04 + (i % 3) * 0.04), Math.sin(a) * r * (1.04 + (i % 3) * 0.04));
        c.stroke();
      }
      // голки-крапочки на тілі
      c.fillStyle = "rgba(244,238,196,0.85)";
      for (const [f, s] of [
        [-0.2, -0.5],
        [-0.6, 0.35],
        [-0.15, 0.62],
        [-0.75, -0.3],
      ] as const) {
        const [x, y] = pt(f, s);
        circle(c, x, y, r * 0.025);
        c.fill();
      }
      // рожева квітка на «маківці»
      const [cx, cy] = pt(-0.5, -0.1);
      c.fillStyle = "#ff7ea8";
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        circle(c, cx + Math.cos(a) * r * 0.17, cy + Math.sin(a) * r * 0.17, r * 0.15);
        c.fill();
      }
      c.fillStyle = "#ffa6c2";
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + 0.3;
        circle(c, cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2, r * 0.07);
        c.fill();
      }
      c.fillStyle = "#ffd24a";
      circle(c, cx, cy, r * 0.1);
      c.fill();
      break;
    }
    case "mushroom": {
      const [cx, cy] = pt(-0.42, -0.1);
      // капелюшок
      c.fillStyle = "#b52d36";
      circle(c, cx + r * 0.03, cy + r * 0.05, r * 0.74);
      c.fill();
      c.fillStyle = "#d4413f";
      circle(c, cx, cy, r * 0.74);
      c.fill();
      c.fillStyle = "#e8605a";
      c.globalAlpha = 0.7;
      circle(c, cx - r * 0.18, cy - r * 0.2, r * 0.4);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = "#f8e3d2";
      for (const [f, s, rr] of [
        [-0.62, -0.3, 0.15],
        [-0.3, -0.62, 0.1],
        [-0.82, 0.12, 0.12],
        [-0.4, 0.3, 0.1],
        [-0.15, -0.25, 0.07],
        [-0.88, -0.55, 0.07],
      ] as const) {
        const [x, y] = pt(f, s);
        circle(c, x, y, rr * r);
        c.fill();
      }
      // мініатюрний грибок збоку
      const [mx, my] = pt(-0.3, 0.88);
      miniMushroom(c, mx, my, Math.atan2(my, mx), r);
      break;
    }
    case "lava": {
      c.save();
      circle(c, 0, 0, r * 0.84);
      c.clip();
      const paths: [number, number][][] = [
        [
          [-0.9, -0.1],
          [-0.55, 0.12],
          [-0.35, -0.15],
          [-0.05, -0.3],
        ],
        [
          [-0.3, 0.9],
          [-0.5, 0.5],
          [-0.2, 0.35],
          [0.1, 0.62],
        ],
        [
          [-0.65, -0.75],
          [-0.42, -0.45],
          [-0.65, -0.28],
        ],
        [
          [-0.1, -0.9],
          [-0.1, -0.62],
          [0.15, -0.55],
        ],
      ];
      for (const [col, w] of [
        ["#ff6a1a", 0.09],
        ["#ffc24d", 0.035],
      ] as const) {
        c.strokeStyle = col;
        c.lineWidth = Math.max(1, r * w);
        c.lineCap = "round";
        c.lineJoin = "round";
        for (const p of paths) {
          c.beginPath();
          p.forEach(([f, s], i) => {
            const [x, y] = pt(f, s);
            if (i) c.lineTo(x, y);
            else c.moveTo(x, y);
          });
          c.stroke();
        }
      }
      c.restore();
      c.strokeStyle = "rgba(255,120,40,0.28)";
      c.lineWidth = Math.max(1, r * 0.04);
      circle(c, 0, 0, r * 0.9);
      c.stroke();
      // вогники: великий на «маківці», менші по боках
      const [bx, by] = pt(-0.78, 0);
      flame(c, bx, by, ang + Math.PI, r * 0.55, r * 0.2, "#ff8a1f", "#ffd45a");
      const [sx, sy] = pt(-0.2, 0.95);
      flame(c, sx, sy, Math.atan2(sy, sx), r * 0.32, r * 0.12, "#ff8a1f", "#ffd45a");
      const [ex, ey] = pt(-0.7, -0.85);
      flame(c, ex, ey, Math.atan2(ey, ex), r * 0.25, r * 0.1, "#ff7a1a", "#ffd45a");
      c.fillStyle = "#ffb347";
      for (const [f, s, rr] of [
        [-1.15, 0.45, 0.04],
        [-1.0, -0.5, 0.03],
        [0.2, 1.0, 0.03],
      ] as const) {
        const [x, y] = pt(f, s);
        circle(c, x, y, rr * r);
        c.fill();
      }
      break;
    }
    case "galaxy": {
      // спіральна галактика на спині
      const [gx, gy] = pt(-0.5, -0.12);
      const gr = r * 0.46;
      const g = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, "rgba(255,240,255,0.95)");
      g.addColorStop(0.35, "rgba(190,150,255,0.7)");
      g.addColorStop(1, "rgba(120,90,220,0)");
      c.fillStyle = g;
      circle(c, gx, gy, gr);
      c.fill();
      c.lineCap = "round";
      for (const [col, off] of [
        ["#d9b8ff", 0],
        ["#ff9fd6", Math.PI],
      ] as const) {
        c.strokeStyle = col;
        c.lineWidth = Math.max(1.2, r * 0.05);
        c.beginPath();
        for (let t = 0; t <= 1; t += 0.08) {
          const a = off + t * 4.2 + ang;
          const rr = gr * (0.15 + t * 0.85);
          const x = gx + Math.cos(a) * rr;
          const y = gy + Math.sin(a) * rr * 0.9;
          if (t === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      c.fillStyle = "#fff6d0";
      circle(c, gx, gy, r * 0.05);
      c.fill();
      // зірки й іскорки
      c.fillStyle = "#ffd86b";
      const [sx, sy] = pt(-0.1, 0.95);
      star(c, sx, sy, r * 0.2);
      c.fill();
      const [s2x, s2y] = pt(-1.05, -0.6);
      star(c, s2x, s2y, r * 0.12);
      c.fill();
      c.fillStyle = "#e9e4ff";
      for (const [f, s, rr] of [
        [-0.2, -0.65, 0.035],
        [-0.85, 0.45, 0.04],
        [0.05, -0.85, 0.03],
        [-0.3, 0.45, 0.03],
        [-1.05, 0.05, 0.035],
      ] as const) {
        const [x, y] = pt(f, s);
        circle(c, x, y, rr * r);
        c.fill();
      }
      // темні оченята з відблиском на світлій мордочці
      for (const side of [-1, 1]) {
        const [ex, ey] = pt(0.32, side * 0.2);
        c.fillStyle = "#1d1a46";
        circle(c, ex, ey, r * 0.115);
        c.fill();
        c.fillStyle = "#fff";
        circle(c, ex + r * 0.035, ey - r * 0.04, r * 0.035);
        c.fill();
      }
      break;
    }
    case "storm": {
      // блискавка на спині
      const bolt: [number, number][] = [
        [-0.42, -0.5],
        [-0.85, -0.02],
        [-0.62, -0.02],
        [-0.82, 0.52],
        [-0.3, 0.0],
        [-0.55, 0.0],
      ];
      c.fillStyle = "#ffd93b";
      c.strokeStyle = "#e0a000";
      c.lineWidth = Math.max(1, r * 0.04);
      c.lineJoin = "round";
      c.beginPath();
      bolt.forEach(([f, s], i) => {
        const [x, y] = pt(f, s);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#fff3a0";
      for (const [f, s, rr] of [
        [-0.2, -0.75, 0.04],
        [-1.0, 0.45, 0.035],
      ] as const) {
        const [x, y] = pt(f, s);
        star(c, x, y, rr * r * 1.6, 4, 0.35);
        c.fill();
      }
      break;
    }
    case "robot": {
      // шви корпуса
      c.strokeStyle = "rgba(150,115,85,0.55)";
      c.lineWidth = line;
      c.lineCap = "round";
      c.beginPath();
      c.arc(0, 0, r * 0.72, ang + 2.0, ang + 4.3);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, r * 0.45, ang + 2.4, ang + 3.9);
      c.stroke();
      c.fillStyle = "#ff8a3d";
      for (const [f, s, rr] of [
        [-0.55, 0.45, 0.09],
        [-0.35, -0.55, 0.07],
      ] as const) {
        const [x, y] = pt(f, s);
        circle(c, x, y, rr * r);
        c.fill();
      }
      // навушники
      for (const side of [-1, 1]) {
        const [x, y] = pt(0.0, side * 0.92);
        c.fillStyle = "#ee6f2d";
        circle(c, x, y, r * 0.24);
        c.fill();
        c.fillStyle = "#ff9a58";
        circle(c, x - r * 0.03, y - r * 0.03, r * 0.17);
        c.fill();
        c.strokeStyle = "#b8501c";
        c.lineWidth = line;
        circle(c, x, y, r * 0.24);
        c.stroke();
      }
      // світні блакитні очі на темному візорі
      for (const side of [-1, 1]) {
        const [ex, ey] = pt(0.3, side * 0.2);
        c.fillStyle = "#56d4ff";
        circle(c, ex, ey, r * 0.135);
        c.fill();
        c.fillStyle = "#d9f7ff";
        circle(c, ex + r * 0.035, ey - r * 0.04, r * 0.045);
        c.fill();
      }
      c.fillStyle = "rgba(255,130,150,0.7)";
      for (const side of [-1, 1]) {
        const [x, y] = pt(0.28, side * 0.36);
        circle(c, x, y, r * 0.05);
        c.fill();
      }
      break;
    }
    case "sushi": {
      // смужка норі впоперек, лосось і зелень зверху на спині
      c.save();
      circle(c, 0, 0, r * 0.86);
      c.clip();
      c.fillStyle = "#1f3b2d";
      c.beginPath();
      for (const [f, s] of [
        [-0.12, -1.1],
        [-0.12, 1.1],
        [-0.48, 1.1],
        [-0.48, -1.1],
      ] as const) {
        const [x, y] = pt(f, s);
        if (f === -0.12 && s === -1.1) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(120,170,130,0.45)";
      c.lineWidth = line;
      for (const f of [-0.2, -0.4]) {
        const [x0, y0] = pt(f, -1);
        const [x1, y1] = pt(f, 1);
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      }
      c.restore();
      const [sx, sy] = pt(-0.78, 0);
      c.save();
      c.translate(sx, sy);
      c.rotate(ang);
      c.fillStyle = "#f2733a";
      c.beginPath();
      c.ellipse(0, 0, r * 0.34, r * 0.62, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#ff9a63";
      c.beginPath();
      c.ellipse(-r * 0.06, -r * 0.05, r * 0.24, r * 0.48, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "#ffd9c2";
      c.lineWidth = Math.max(1, r * 0.04);
      c.lineCap = "round";
      for (const k of [-0.3, 0, 0.3]) {
        c.beginPath();
        c.moveTo(-r * 0.2, k * r - r * 0.12);
        c.quadraticCurveTo(0, k * r, r * 0.2, k * r + r * 0.1);
        c.stroke();
      }
      c.fillStyle = "#6fb64a";
      circle(c, -r * 0.05, r * 0.05, r * 0.11);
      c.fill();
      c.fillStyle = "#4e9a35";
      circle(c, r * 0.1, -r * 0.08, r * 0.07);
      c.fill();
      c.restore();
      break;
    }
  }
}
