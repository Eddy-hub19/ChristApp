import type { Skin } from "./flockSkins";
import { specialExtent } from "./flockSpecialDeco";

/**
 * Артефакти «Отари»: предмети поверх будь-якого скіна. Номер = номер на сервері (backend FLOCK_CONFIG.artifacts / ARTIFACT),
 * 0 - нічого не надіто. Тут же - спрощена відрисовка для овечки (без свічення, іскор і диму: на малому розмірі це каша
 * і зайве навантаження) і точки кріплення для кожного виду істоти.
 */
export type ArtifactKey = "shoes" | "priestHat" | "crown" | "magnet" | "hourglass" | "cross" | "censer";

/** Індекс = номер артефакта - 1. Порядок збігається з backend ARTIFACT. */
export const ARTIFACT_KEYS: readonly ArtifactKey[] = ["shoes", "priestHat", "crown", "magnet", "hourglass", "cross", "censer"];
export const ARTIFACT_IDS: readonly number[] = ARTIFACT_KEYS.map((_, i) => i + 1);
export const NUM_ARTIFACTS = ARTIFACT_KEYS.length;
export const isArtifactId = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= NUM_ARTIFACTS;
export const artifactKey = (id: number): ArtifactKey | null => (isArtifactId(id) ? ARTIFACT_KEYS[id - 1] : null);

/** Файл іконки для плиток лобі (WebP 256x256, прозорий фон). */
const ICON_FILE: Record<ArtifactKey, string> = {
  shoes: "shoes",
  priestHat: "priest-hat",
  crown: "crown",
  magnet: "magnet",
  hourglass: "hourglass",
  cross: "cross",
  censer: "censer",
};
export const artifactIconSrc = (id: number): string | null => {
  const k = artifactKey(id);
  return k ? `/flock/artifacts/${ICON_FILE[k]}.webp` : null;
};

/**
 * Точки кріплення. Система координат істоти: +x - куди дивиться мордочка, +y - вправо, одиниця - радіус тіла.
 * Малюємо в тій самій системі, тож артефакт повертається й масштабується разом із овечкою.
 */
export interface ArtifactAnchor {
  /** Макушка: центр шапки/корони по осі вперед і масштаб (1 = для вівці). */
  headX: number;
  headS: number;
  /** Бік: кут від напрямку вперед (рад), відстань від центру й масштаб для магніта, годинника, кадила. */
  sideAng: number;
  sideR: number;
  sideS: number;
  /** Ніжки (задні): вперед/вбік і масштаб. */
  feetX: number;
  feetY: number;
  feetS: number;
  /** Шия: центр дуги ланцюжка по осі вперед. */
  neckX: number;
}

const BASE: Record<Skin["kind"], ArtifactAnchor> = {
  // вівця / ягня / баран: мордочка на 0.36, вуха на ±100°, роги барана на ±89° - бік і ніжки відсунуті назад
  sheep: { headX: -0.1, headS: 1, sideAng: 2.45, sideR: 0.98, sideS: 1.75, feetX: -0.52, feetY: 0.72, feetS: 1.70, neckX: 0.3 },
  lamb: { headX: -0.1, headS: 0.95, sideAng: 2.45, sideR: 0.98, sideS: 1.66, feetX: -0.52, feetY: 0.72, feetS: 1.61, neckX: 0.3 },
  ram: { headX: -0.14, headS: 1, sideAng: 2.5, sideR: 1.0, sideS: 1.75, feetX: -0.55, feetY: 0.72, feetS: 1.70, neckX: 0.3 },
  // вовк і пес: уся істота - голова, вуха стирчать на ±60° (вовк) / по боках (пес)
  wolf: { headX: -0.02, headS: 0.95, sideAng: 2.55, sideR: 0.98, sideS: 1.66, feetX: -0.52, feetY: 0.72, feetS: 1.61, neckX: 0.3 },
  dog: { headX: -0.06, headS: 0.95, sideAng: 2.55, sideR: 0.98, sideS: 1.66, feetX: -0.52, feetY: 0.72, feetS: 1.61, neckX: 0.3 },
};

/** Точки кріплення для скіна: база виду + поправка для особливих скінів із виступаючими деталями (кристали, обгортка, листя...). */
export function anchorFor(skin: Skin): ArtifactAnchor {
  const base = BASE[skin.kind];
  const ext = specialExtent(skin);
  if (!skin.deco || ext <= 1.3) return base;
  // виступи ззаду й по боках: бік і ніжки далі від центру, щоб артефакт сидів на виступі, а не тонув у ньому
  const out = ext >= 1.5 ? 0.16 : 0.08;
  const a = { ...base, sideR: base.sideR + out, feetY: base.feetY + out * 0.8, feetX: base.feetX - out * 0.5 };
  // голова: робот (антена), гриб, вогник лави, квітка кактуса, вінок листя - шапка трохи далі назад, щоб не з'їдати очі
  if (skin.deco === "robot" || skin.deco === "mushroom" || skin.deco === "lava" || skin.deco === "cactus" || skin.deco === "leaves" || skin.deco === "candy")
    a.headX = base.headX - 0.08;
  return a;
}

/** Найбільший виліт артефакта за радіус тіла (півсторони спрайта в радіусах тіла). */
export const ARTIFACT_EXTENT = 1.7;

const TAU = Math.PI * 2;
const GOLD = "#f2b61c";
const GOLD_LIGHT = "#ffe27a";
const GOLD_DARK = "#b87a08";
const OUTLINE = "rgba(60,30,0,0.45)";

function disc(c: CanvasRenderingContext2D, x: number, y: number, rr: number) {
  c.beginPath();
  c.arc(x, y, rr, 0, TAU);
}

/** Золота «куля» з відблиском і темною кромкою. */
function goldBall(c: CanvasRenderingContext2D, x: number, y: number, rr: number, lw: number) {
  c.fillStyle = GOLD;
  disc(c, x, y, rr);
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = OUTLINE;
  c.stroke();
  c.fillStyle = GOLD_LIGHT;
  disc(c, x - rr * 0.3, y - rr * 0.3, rr * 0.38);
  c.fill();
}

/** Хрестик із розширеними кінцями (як на камілавці): плюс і чотири кульки. */
function budCross(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  c.fillStyle = color;
  const t = size * 0.3;
  c.fillRect(x - t / 2, y - size, t, size * 2);
  c.fillRect(x - size, y - t / 2, size * 2, t);
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    disc(c, x + dx * size, y + dy * size, t * 0.78);
    c.fill();
  }
}

function drawShoes(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  const lw = Math.max(1, r * 0.04);
  for (const side of [-1, 1]) {
    c.save();
    c.translate(a.feetX * r, side * a.feetY * r);
    c.scale(a.feetS, a.feetS);
    // білі крильця позаду-назовні
    c.fillStyle = "#ffffff";
    c.strokeStyle = "rgba(120,90,40,0.45)";
    c.lineWidth = lw;
    for (const [dx, dy, ex, ey, rot] of [
      [-0.2, 0.08, 0.26, 0.09, 0.35],
      [-0.12, 0.16, 0.2, 0.075, 0.7],
    ] as const) {
      c.beginPath();
      c.ellipse(dx * r, side * dy * r, ex * r, ey * r, side * rot + Math.PI, 0, TAU);
      c.fill();
      c.stroke();
    }
    // золота сандалія: підошва, шкарпетка, ремінець
    c.fillStyle = GOLD;
    c.beginPath();
    c.ellipse(0, 0, r * 0.25, r * 0.15, 0, 0, TAU);
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = lw;
    c.stroke();
    c.fillStyle = GOLD_LIGHT;
    c.beginPath();
    c.ellipse(r * 0.07, -r * 0.03, r * 0.13, r * 0.06, 0, 0, TAU);
    c.fill();
    c.strokeStyle = "#7a4a10";
    c.lineWidth = Math.max(1, r * 0.035);
    c.beginPath();
    c.moveTo(-r * 0.04, -r * 0.13);
    c.lineTo(-r * 0.04, r * 0.13);
    c.stroke();
    c.restore();
  }
}

function drawPriestHat(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  const x = a.headX * r;
  const rr = r * 0.4 * a.headS;
  c.fillStyle = GOLD;
  disc(c, x, 0, rr);
  c.fill();
  c.lineWidth = Math.max(1, r * 0.04);
  c.strokeStyle = OUTLINE;
  c.stroke();
  c.fillStyle = "#1d1b24";
  disc(c, x, 0, rr * 0.82);
  c.fill();
  c.fillStyle = "#3a3744";
  c.beginPath();
  c.ellipse(x - rr * 0.22, -rr * 0.25, rr * 0.38, rr * 0.2, -0.5, 0, TAU);
  c.fill();
  budCross(c, x, 0, rr * 0.34, GOLD_LIGHT);
}

function drawCrown(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  const x = a.headX * r;
  const rr = r * 0.42 * a.headS;
  const lw = Math.max(1, r * 0.04);
  // золотий обідок із рубіновими камінцями
  c.fillStyle = GOLD;
  disc(c, x, 0, rr);
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = lw;
  c.stroke();
  // червона подушка всередині
  c.fillStyle = "#c8102e";
  disc(c, x, 0, rr * 0.7);
  c.fill();
  c.fillStyle = "#ff6a7e";
  disc(c, x - rr * 0.22, -rr * 0.24, rr * 0.2);
  c.fill();
  // золоті дуги хрестом
  c.strokeStyle = GOLD;
  c.lineWidth = rr * 0.2;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - rr * 0.82, 0);
  c.lineTo(x + rr * 0.82, 0);
  c.moveTo(x, -rr * 0.82);
  c.lineTo(x, rr * 0.82);
  c.stroke();
  // камінці по краю й золота куля зверху
  c.fillStyle = "#e0142f";
  for (let i = 0; i < 4; i++) {
    const ang = (i + 0.5) * (TAU / 4);
    disc(c, x + Math.cos(ang) * rr * 0.86, Math.sin(ang) * rr * 0.86, rr * 0.11);
    c.fill();
  }
  goldBall(c, x, 0, rr * 0.2, lw);
  c.fillStyle = "#e0142f";
  disc(c, x, 0, rr * 0.08);
  c.fill();
}

/** Предмет збоку: локальні координати - +x назовні від тіла, центр у точці кріплення. */
function atSide(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor, side: number, draw: (s: number) => void) {
  const ang = side * a.sideAng;
  c.save();
  c.translate(Math.cos(ang) * a.sideR * r, Math.sin(ang) * a.sideR * r);
  c.rotate(ang);
  draw(a.sideS);
  c.restore();
}

function drawMagnet(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  atSide(c, r, a, 1, (s) => {
    const R = r * 0.17 * s;
    const w = r * 0.13 * s;
    const lw = Math.max(1, r * 0.035);
    c.lineCap = "butt";
    // підкова відкрита назовні; дужка - червона половина й синя
    c.lineWidth = w + lw * 1.4;
    c.strokeStyle = OUTLINE;
    c.beginPath();
    c.arc(0, 0, R, Math.PI / 2, (Math.PI * 3) / 2);
    c.stroke();
    c.lineWidth = w;
    c.strokeStyle = "#e8262c";
    c.beginPath();
    c.arc(0, 0, R, Math.PI / 2, Math.PI);
    c.stroke();
    c.strokeStyle = "#1f5fd8";
    c.beginPath();
    c.arc(0, 0, R, Math.PI, (Math.PI * 3) / 2);
    c.stroke();
    // срібні наконечники
    for (const sy of [-1, 1]) {
      c.fillStyle = "#e4e8ef";
      const px = 0;
      const py = sy * R - w / 2;
      c.fillRect(px, py, r * 0.15 * s, w);
      c.strokeStyle = "rgba(60,70,90,0.55)";
      c.lineWidth = lw;
      c.strokeRect(px, py, r * 0.15 * s, w);
    }
  });
}

function drawHourglass(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  atSide(c, r, a, -1, (s) => {
    const h = r * 0.21 * s; // півдовжина
    const w = r * 0.15 * s; // півширина скла
    const lw = Math.max(1, r * 0.035);
    // вісь годинника - уздовж тіла (по дотичній), тому повертаємо на 90°
    c.rotate(Math.PI / 2);
    c.fillStyle = "#cfe8ff";
    c.strokeStyle = OUTLINE;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(-w, -h);
    c.lineTo(w, -h);
    c.lineTo(w * 0.12, 0);
    c.lineTo(w, h);
    c.lineTo(-w, h);
    c.lineTo(-w * 0.12, 0);
    c.closePath();
    c.fill();
    c.stroke();
    // золотий пісок
    c.fillStyle = "#ffcf33";
    c.beginPath();
    c.moveTo(-w * 0.62, -h * 0.35);
    c.lineTo(w * 0.62, -h * 0.35);
    c.lineTo(w * 0.1, -h * 0.02);
    c.lineTo(-w * 0.1, -h * 0.02);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-w * 0.8, h * 0.9);
    c.lineTo(w * 0.8, h * 0.9);
    c.lineTo(0, h * 0.4);
    c.closePath();
    c.fill();
    // золоті кришки й стійки
    c.fillStyle = GOLD;
    for (const sy of [-1, 1]) {
      c.fillRect(-w * 1.25, sy * h - (sy > 0 ? 0 : h * 0.22), w * 2.5, h * 0.22);
      c.strokeRect(-w * 1.25, sy * h - (sy > 0 ? 0 : h * 0.22), w * 2.5, h * 0.22);
    }
  });
}

function drawCross(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  const cx = a.neckX * r;
  const rr = r * 0.52;
  const lw = Math.max(1, r * 0.035);
  // ланцюжок: дуга позаду голови від боку до боку; кульки замість суцільної лінії
  const n = 11;
  c.fillStyle = GOLD;
  c.strokeStyle = OUTLINE;
  c.lineWidth = lw * 0.6;
  for (let i = 0; i < n; i++) {
    const ang = Math.PI * (0.62 + (i / (n - 1)) * 0.76);
    disc(c, cx + Math.cos(ang) * rr, Math.sin(ang) * rr, r * 0.055);
    c.fill();
    c.stroke();
  }
  // хрестик-підвіска на грудях, під дугою
  const px = cx - rr - r * 0.02;
  const t = r * 0.12;
  const L = r * 0.27;
  c.fillStyle = GOLD;
  c.strokeStyle = OUTLINE;
  c.lineWidth = lw;
  c.beginPath();
  c.rect(px - t, -L, t * 2, L * 2);
  c.rect(px - L * 0.82, -t, L * 1.64, t * 2);
  c.fill();
  c.stroke();
  c.fillStyle = GOLD;
  c.fillRect(px - t + lw * 0.5, -L + lw * 0.5, t * 2 - lw, L * 2 - lw);
  c.fillRect(px - L * 0.82 + lw * 0.5, -t + lw * 0.5, L * 1.64 - lw, t * 2 - lw);
  c.fillStyle = GOLD_LIGHT;
  c.fillRect(px - t * 0.45, -L * 0.8, t * 0.5, L * 1.4);
}

function drawCenser(c: CanvasRenderingContext2D, r: number, a: ArtifactAnchor) {
  atSide(c, r, a, 1, (s) => {
    const lw = Math.max(1, r * 0.035);
    // ланцюжки до краю тіла
    c.strokeStyle = GOLD_DARK;
    c.lineWidth = Math.max(1, r * 0.04);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-r * 0.22 * s, -r * 0.1 * s);
    c.lineTo(r * 0.06 * s, 0);
    c.moveTo(-r * 0.22 * s, r * 0.1 * s);
    c.lineTo(r * 0.06 * s, 0);
    c.stroke();
    // кадильниця: куля з кришкою, темні хрестики-прорізи
    const R = r * 0.17 * s;
    const x = r * 0.14 * s;
    c.fillStyle = GOLD;
    disc(c, x, 0, R);
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = lw;
    c.stroke();
    c.fillStyle = GOLD_DARK;
    c.beginPath();
    c.arc(x, 0, R * 0.98, Math.PI * 0.62, Math.PI * 1.38);
    c.closePath();
    c.fill();
    c.fillStyle = "#3b2208";
    for (const [dx, dy] of [
      [0.05, -0.42],
      [0.05, 0.42],
      [0.5, 0],
    ] as const) {
      disc(c, x + dx * R, dy * R, R * 0.17);
      c.fill();
    }
    c.fillStyle = GOLD_LIGHT;
    disc(c, x - R * 0.12, -R * 0.1, R * 0.2);
    c.fill();
    goldBall(c, x + R * 1.12, 0, R * 0.22, lw);
  });
}

/** Малює артефакт у системі істоти (початок - центр тіла, +x - вперед). Контекст уже повернутий за напрямком. */
export function drawArtifactShape(c: CanvasRenderingContext2D, id: number, r: number, a: ArtifactAnchor) {
  c.save();
  c.lineJoin = "round";
  switch (artifactKey(id)) {
    case "shoes":
      drawShoes(c, r, a);
      break;
    case "priestHat":
      drawPriestHat(c, r, a);
      break;
    case "crown":
      drawCrown(c, r, a);
      break;
    case "magnet":
      drawMagnet(c, r, a);
      break;
    case "hourglass":
      drawHourglass(c, r, a);
      break;
    case "cross":
      drawCross(c, r, a);
      break;
    case "censer":
      drawCenser(c, r, a);
      break;
  }
  c.restore();
}

/** Прямо на полотно (прев'ю в лобі, дуже великі істоти): без кешу. */
export function drawArtifact(c: CanvasRenderingContext2D, id: number, skin: Skin, x: number, y: number, r: number, ang: number) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  drawArtifactShape(c, id, r, anchorFor(skin));
  c.restore();
}
