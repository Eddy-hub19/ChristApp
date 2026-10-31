/**
 * Земля й їжа-«трава» для карт, що не схожі на звичайний луг: «Гай» (опале листя), «Мороз» (сніг), «Вулкан» (попіл і жар).
 * Усе малюється один раз у кешований тайл / спрайт; кольори не залежать від теми застосунку (світла/темна).
 */

export type Ground = "meadow" | "autumn" | "snow" | "volcano" | "lake";

const TAU = Math.PI * 2;

/** Вид землі за номером карти (FLOCK_MAPS на сервері): 0 луг, 1 гай, 2 мороз, 3 вулкан. */
export function groundOf(map: number | undefined): Ground {
  switch (map) {
    case 1:
      return "autumn";
    case 2:
      return "snow";
    case 3:
      return "volcano";
    case 4:
      return "lake";
    default:
      return "meadow";
  }
}

/** Сторона тайла землі в світових одиницях (більша за луг, щоб повтор не впадав в очі). */
export const GROUND_SPAN = 540;

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Малює фігуру ще й зі зсувом на період, коли вона біля краю тайла, - патерн стикується без швів. */
function wrapped(span: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [0, -span, span]) {
    if (dx < 0 && x + r < span) continue;
    if (dx > 0 && x - r > 0) continue;
    for (const dy of [0, -span, span]) {
      if (dy < 0 && y + r < span) continue;
      if (dy > 0 && y - r > 0) continue;
      draw(x + dx, y + dy);
    }
  }
}

function leaf(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, fill: string, vein: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(-s, 0);
  c.quadraticCurveTo(0, -s * 0.62, s, 0);
  c.quadraticCurveTo(0, s * 0.62, -s, 0);
  c.fill();
  c.strokeStyle = vein;
  c.lineWidth = Math.max(0.8, s * 0.09);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-s * 1.05, 0);
  c.lineTo(s * 0.75, 0);
  c.stroke();
  c.restore();
}

const LEAF_COLORS: [string, string][] = [
  ["#f2c230", "#a8741a"],
  ["#e8a22a", "#9a5a14"],
  ["#d9822a", "#8a3f12"],
  ["#f7d85a", "#b88a22"],
  ["#c9622a", "#7a2c10"],
];

/** Малює землю тайла (контекст уже у світових одиницях, розмір span x span). */
export function paintGround(c: CanvasRenderingContext2D, span: number, ground: Ground, bg: string, grid: string, cell: number) {
  c.fillStyle = bg;
  c.fillRect(0, 0, span, span);
  // легка сітка (як у лузі, але ледь помітна)
  c.strokeStyle = grid;
  c.lineWidth = 1.2;
  c.beginPath();
  for (let i = 0; i <= span / cell; i++) {
    c.moveTo(i * cell, 0);
    c.lineTo(i * cell, span);
    c.moveTo(0, i * cell);
    c.lineTo(span, i * cell);
  }
  c.stroke();
  const r = rng(ground === "snow" ? 11 : ground === "autumn" ? 29 : ground === "meadow" ? 71 : ground === "lake" ? 83 : 47);
  if (ground === "meadow" || ground === "lake") {
    // трава: пятна чуть разных оттенков (светлее и темнее базового зелёного), травинки и мелкие цветочки
    for (let i = 0; i < 34; i++) {
      const x = r() * span;
      const y = r() * span;
      const w = 40 + r() * 80;
      c.fillStyle = r() < 0.5 ? "rgba(255,255,200,0.07)" : "rgba(10,70,20,0.09)";
      wrapped(span, x, y, w, (px, py) => {
        c.beginPath();
        c.ellipse(px, py, w, w * (0.45 + r() * 0.2), r() * 3, 0, TAU);
        c.fill();
      });
    }
    c.lineCap = "round";
    const blades = ["rgba(40,120,40,0.55)", "rgba(80,160,60,0.5)", "rgba(20,90,40,0.5)", "rgba(150,200,80,0.5)"];
    for (let i = 0; i < 260; i++) {
      const x = r() * span;
      const y = r() * span;
      const h = 7 + r() * 8;
      c.strokeStyle = blades[Math.floor(r() * blades.length)];
      c.lineWidth = 1.6;
      const lean = (r() - 0.5) * 8;
      wrapped(span, x, y, 12, (px, py) => {
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px - 3 + lean * 0.3, py - h);
        c.moveTo(px, py);
        c.lineTo(px + lean * 0.5, py - h * 1.15);
        c.moveTo(px, py);
        c.lineTo(px + 3 + lean * 0.7, py - h * 0.9);
        c.stroke();
      });
    }
    const petals = ["#ffffff", "#ffe36a", "#ff9ec4", "#c9a6ff", "#ff8a6a"];
    for (let i = 0; i < 46; i++) {
      const x = r() * span;
      const y = r() * span;
      const col = petals[Math.floor(r() * petals.length)];
      wrapped(span, x, y, 6, (px, py) => {
        c.fillStyle = col;
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.arc(px + Math.cos((k / 5) * TAU) * 2.4, py + Math.sin((k / 5) * TAU) * 2.4, 1.8, 0, TAU);
          c.fill();
        }
        c.fillStyle = "#f3b92a";
        c.beginPath();
        c.arc(px, py, 1.5, 0, TAU);
        c.fill();
      });
    }
  } else if (ground === "snow") {
    // замети: світлі пагорбки з блакитною тінню знизу
    for (let i = 0; i < 26; i++) {
      const x = r() * span;
      const y = r() * span;
      const w = 24 + r() * 56;
      const h = w * (0.28 + r() * 0.16);
      wrapped(span, x, y, w, (px, py) => {
        c.fillStyle = "rgba(160,190,225,0.35)";
        c.beginPath();
        c.ellipse(px + 3, py + h * 0.45, w, h, 0, 0, TAU);
        c.fill();
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.beginPath();
        c.ellipse(px, py, w, h, 0, 0, TAU);
        c.fill();
      });
    }
    // сліди: три доріжки з пар відбитків
    for (let t = 0; t < 3; t++) {
      let x = r() * span;
      let y = r() * span;
      const a = r() * TAU;
      c.fillStyle = "rgba(140,170,205,0.55)";
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const px = x + Math.cos(a + Math.PI / 2) * side * 5;
        const py = y + Math.sin(a + Math.PI / 2) * side * 5;
        wrapped(span, px, py, 6, (qx, qy) => {
          c.beginPath();
          c.ellipse(qx, qy, 4.2, 2.6, a, 0, TAU);
          c.fill();
        });
        x += Math.cos(a) * 17;
        y += Math.sin(a) * 17;
      }
    }
    // ёлочки: маленькие, со снежными шапками
    for (let i = 0; i < 9; i++) {
      const x = r() * span;
      const y = r() * span;
      const s = 12 + r() * 9;
      wrapped(span, x, y, s * 1.4, (px, py) => {
        c.fillStyle = "rgba(120,150,190,0.3)";
        c.beginPath();
        c.ellipse(px + s * 0.3, py + s * 0.15, s * 0.9, s * 0.28, 0, 0, TAU);
        c.fill();
        c.fillStyle = "#5a3d24";
        c.fillRect(px - s * 0.09, py - s * 0.2, s * 0.18, s * 0.34);
        for (let k = 0; k < 3; k++) {
          const w = s * (0.95 - k * 0.27);
          const top = py - s * (0.2 + k * 0.5);
          c.fillStyle = "#2f7a4d";
          c.beginPath();
          c.moveTo(px - w, top);
          c.lineTo(px, top - s * 0.85);
          c.lineTo(px + w, top);
          c.closePath();
          c.fill();
          c.fillStyle = "#ffffff";
          c.beginPath();
          c.moveTo(px - w * 0.62, top - s * 0.32);
          c.lineTo(px, top - s * 0.85);
          c.lineTo(px + w * 0.62, top - s * 0.32);
          c.quadraticCurveTo(px, top - s * 0.18, px - w * 0.62, top - s * 0.32);
          c.fill();
        }
      });
    }
    // снежные комочки
    for (let i = 0; i < 24; i++) {
      const x = r() * span;
      const y = r() * span;
      const s = 3 + r() * 4;
      wrapped(span, x, y, s, (px, py) => {
        c.fillStyle = "rgba(150,180,215,0.45)";
        c.beginPath();
        c.arc(px + 1, py + s * 0.5, s, 0, TAU);
        c.fill();
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(px, py, s, 0, TAU);
        c.fill();
        c.fillStyle = "rgba(190,215,240,0.8)";
        c.beginPath();
        c.arc(px + s * 0.3, py + s * 0.3, s * 0.55, 0, TAU);
        c.fill();
      });
    }
    // блиск
    c.fillStyle = "rgba(255,255,255,0.95)";
    for (let i = 0; i < 40; i++) {
      const x = r() * span;
      const y = r() * span;
      wrapped(span, x, y, 2, (px, py) => {
        c.beginPath();
        c.arc(px, py, 1.5, 0, TAU);
        c.fill();
      });
    }
  } else if (ground === "autumn") {
    // опале листя вздовж землі
    for (let i = 0; i < 92; i++) {
      const x = r() * span;
      const y = r() * span;
      const s = 5 + r() * 5;
      const [fill, vein] = LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)];
      const rot = r() * TAU;
      wrapped(span, x, y, s, (px, py) => leaf(c, px, py, s, rot, fill, vein));
    }
    // темніші плями ґрунту
    c.fillStyle = "rgba(90,50,20,0.12)";
    for (let i = 0; i < 14; i++) {
      const x = r() * span;
      const y = r() * span;
      const w = 26 + r() * 40;
      wrapped(span, x, y, w, (px, py) => {
        c.beginPath();
        c.ellipse(px, py, w, w * 0.5, r() * 3, 0, TAU);
        c.fill();
      });
    }
  } else if (ground === "volcano") {
    // уламки породи
    for (let i = 0; i < 30; i++) {
      const x = r() * span;
      const y = r() * span;
      const w = 6 + r() * 14;
      wrapped(span, x, y, w, (px, py) => {
        c.fillStyle = "rgba(10,6,8,0.45)";
        c.beginPath();
        c.ellipse(px + 2, py + 3, w, w * 0.62, 0, 0, TAU);
        c.fill();
        c.fillStyle = "#3a2e31";
        c.beginPath();
        c.ellipse(px, py, w, w * 0.62, 0.3, 0, TAU);
        c.fill();
        c.fillStyle = "rgba(255,150,80,0.16)";
        c.beginPath();
        c.ellipse(px - w * 0.2, py - w * 0.2, w * 0.45, w * 0.22, 0.3, 0, TAU);
        c.fill();
      });
    }
    // розжарені тріщини: тьмяне світіння + яскрава жилка
    for (let i = 0; i < 12; i++) {
      let x = r() * span;
      let y = r() * span;
      let a = r() * TAU;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 6; k++) {
        a += (r() - 0.5) * 1.3;
        x += Math.cos(a) * (22 + r() * 24);
        y += Math.sin(a) * (22 + r() * 24);
        pts.push([x, y]);
      }
      for (const dx of [0, -span, span]) {
        for (const dy of [0, -span, span]) {
          const path = () => {
            c.beginPath();
            pts.forEach(([px, py], k) => (k ? c.lineTo(px + dx, py + dy) : c.moveTo(px + dx, py + dy)));
          };
          c.lineCap = "round";
          c.lineJoin = "round";
          path();
          c.strokeStyle = "rgba(255,90,20,0.2)";
          c.lineWidth = 8;
          c.stroke();
          path();
          c.strokeStyle = "rgba(255,120,40,0.85)";
          c.lineWidth = 2.4;
          c.stroke();
          path();
          c.strokeStyle = "rgba(255,226,120,0.9)";
          c.lineWidth = 0.9;
          c.stroke();
        }
      }
    }
    // попіл
    for (let i = 0; i < 150; i++) {
      const x = r() * span;
      const y = r() * span;
      c.fillStyle = `rgba(${150 + Math.floor(r() * 60)},${140 + Math.floor(r() * 40)},${140 + Math.floor(r() * 40)},${0.12 + r() * 0.2})`;
      wrapped(span, x, y, 3, (px, py) => {
        c.beginPath();
        c.arc(px, py, 0.8 + r() * 1.8, 0, TAU);
        c.fill();
      });
    }
  }
}

/**
 * Їжа-«трава» не-лугових карт (система координат 40×40, центр у 0,0; kind 0..2 - як у лузі: пучок / квітка / колосок).
 * Однакова цінність, змінюється лише вигляд.
 */
export function drawGroundFood(c: CanvasRenderingContext2D, kind: number, ground: Ground) {
  c.lineCap = "round";
  c.lineJoin = "round";
  if (ground === "autumn") {
    // красные и бордовые листочки: не сливаются с золотым фоном и золотым декором земли (он остаётся золотым)
    const looks: [string, string, number][] = [
      ["#d63a2f", "#6e1410", 0.35],
      ["#a81f33", "#4e0c16", -0.5],
      ["#7c1634", "#3a0818", 0.9],
    ];
    const [fill, vein, rot] = looks[kind] ?? looks[0];
    c.save();
    c.rotate(rot);
    c.scale(1.25, 1.25);
    leaf(c, 0, 0, 12, 0, fill, vein);
    // зубчики/бічні жилки
    c.strokeStyle = vein;
    c.lineWidth = 1;
    c.beginPath();
    for (const k of [-6, 0, 6]) {
      c.moveTo(k, 0);
      c.lineTo(k + 3, -4.5);
      c.moveTo(k, 0);
      c.lineTo(k + 3, 4.5);
    }
    c.stroke();
    c.restore();
    return;
  }
  if (ground === "snow") {
    if (kind === 0) {
      // сніжинка: блакитна основа й біла жилка, щоб читалась на білому снігу
      for (const [col, lw] of [["#6fa8e0", 4.6], ["#ffffff", 1.6]] as [string, number][]) {
        c.strokeStyle = col;
        c.lineWidth = lw;
        for (let i = 0; i < 6; i++) {
          c.save();
          c.rotate((i / 6) * TAU);
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(0, -15);
          c.moveTo(0, -9);
          c.lineTo(-5, -13.5);
          c.moveTo(0, -9);
          c.lineTo(5, -13.5);
          c.stroke();
          c.restore();
        }
      }
      c.fillStyle = "#6fa8e0";
      c.beginPath();
      c.arc(0, 0, 3.4, 0, TAU);
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(0, 0, 1.8, 0, TAU);
      c.fill();
    } else if (kind === 1) {
      // ягоди горобини на гілочці
      c.strokeStyle = "#6a4a2c";
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(-12, 12);
      c.quadraticCurveTo(0, 2, 12, -10);
      c.stroke();
      c.fillStyle = "#d8232f";
      c.strokeStyle = "#8a1018";
      c.lineWidth = 1.2;
      for (const [x, y] of [[-3, 5], [4, 2], [-1, -3], [7, -6], [-7, 1]]) {
        c.beginPath();
        c.arc(x, y, 4.6, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.beginPath();
        c.arc(x - 1.4, y - 1.4, 1.3, 0, TAU);
        c.fill();
        c.fillStyle = "#d8232f";
      }
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(6, -11, 6, 2.8, -0.5, 0, TAU);
      c.fill();
    } else {
      // морозные ягоды можжевельника: синие шарики на веточке со снежной шапкой
      c.strokeStyle = "#4e6a54";
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(-12, 10);
      c.quadraticCurveTo(0, 6, 12, -4);
      c.stroke();
      for (const [x, y] of [[-6, 6], [1, 3], [8, -1], [-1, -3]]) {
        c.fillStyle = "#4a6fd0";
        c.strokeStyle = "#1f3578";
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(x, y, 4.4, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = "rgba(255,255,255,0.85)";
        c.beginPath();
        c.arc(x - 1.3, y - 1.4, 1.2, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(-2, -8, 7, 3, 0.2, 0, TAU);
      c.fill();
    }
    return;
  }
  if (ground === "volcano") {
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, 19);
    glow.addColorStop(0, "rgba(255,170,50,0.75)");
    glow.addColorStop(1, "rgba(255,90,20,0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, 0, 19, 0, TAU);
    c.fill();
    if (kind === 0) {
      // іскорка: чотирипроменева зірочка
      c.fillStyle = "#ffd24a";
      c.strokeStyle = "#e0561a";
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - Math.PI / 2;
        const rr = i % 2 ? 4 : 12;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#fff6c4";
      c.beginPath();
      c.arc(0, 0, 2.6, 0, TAU);
      c.fill();
    } else if (kind === 1) {
      // вуглинка: темний камінь із жаром
      c.fillStyle = "#3a2426";
      c.strokeStyle = "#140c0d";
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(-9, 3);
      c.lineTo(-5, -8);
      c.lineTo(5, -9);
      c.lineTo(10, 1);
      c.lineTo(4, 9);
      c.lineTo(-5, 8);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = "#ff8a2a";
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(-6, 2);
      c.lineTo(-1, -3);
      c.lineTo(3, 3);
      c.lineTo(7, -1);
      c.stroke();
      c.strokeStyle = "#ffe07a";
      c.lineWidth = 0.9;
      c.stroke();
    } else {
      // кілька дрібних іскор
      for (const [x, y, s, col] of [[-6, 4, 4.4, "#ffb02a"], [5, -3, 5.2, "#ffd24a"], [0, 9, 3.4, "#ff7a2a"], [8, 7, 3, "#ffd24a"], [-7, -7, 3.2, "#ff9a2a"]] as [number, number, number, string][]) {
        c.fillStyle = col;
        c.strokeStyle = "rgba(190,60,10,0.8)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y - s);
        c.lineTo(x + s * 0.8, y);
        c.lineTo(x, y + s);
        c.lineTo(x - s * 0.8, y);
        c.closePath();
        c.fill();
        c.stroke();
      }
    }
  }
}

/**
 * Солнечные блики «Лета»: полупрозрачные светлые пятна и мягкие косые лучи. Один статичный тайл (рисуется один раз),
 * поверх земли кладётся паттерном; без анимации и blur. Сторона больше тайла земли, чтобы повторы не совпадали.
 */
export const SUNLIGHT_SPAN = 960;
export function paintSunlight(c: CanvasRenderingContext2D, span: number) {
  const r = rng(131);
  // мягкие лучи: широкие косые полосы с градиентом поперёк
  for (let i = 0; i < 5; i++) {
    const x = r() * span;
    const w = 70 + r() * 90;
    for (const dx of [0, -span]) {
      c.save();
      c.translate(x + dx, 0);
      c.rotate(-0.55);
      const g = c.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, "rgba(255,244,190,0)");
      g.addColorStop(0.5, "rgba(255,244,190,0.14)");
      g.addColorStop(1, "rgba(255,244,190,0)");
      c.fillStyle = g;
      c.fillRect(-w, -span, w * 2, span * 3);
      c.restore();
    }
  }
  // светлые пятна
  for (let i = 0; i < 16; i++) {
    const x = r() * span;
    const y = r() * span;
    const w = 40 + r() * 70;
    wrapped(span, x, y, w, (px, py) => {
      const g = c.createRadialGradient(px, py, 0, px, py, w);
      g.addColorStop(0, "rgba(255,248,205,0.2)");
      g.addColorStop(1, "rgba(255,248,205,0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(px, py, w, w * 0.7, 0.4, 0, TAU);
      c.fill();
    });
  }
}
