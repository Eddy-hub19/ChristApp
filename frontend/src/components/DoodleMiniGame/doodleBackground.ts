/**
 * Фон Doodle: по мере набора очков игрок «поднимается к небесам».
 * Все пороги и палитры — в DOODLE_THEMES: меняйте только этот конфиг.
 */

export type Rgb = [number, number, number];

export type DoodleTheme = {
  key: "warm" | "dawn" | "day" | "night" | "heaven";
  /** С какого счёта тема включается. */
  minScore: number;
  top: string;
  bottom: string;
  /** Ключ подписи (namespace `doodle`), показывается при достижении порога; у стартовой темы её нет. */
  labelKey?: string;
  /** Видимость декоративных слоёв, 0..1. */
  lines: number;
  stars: number;
  shootingStars: boolean;
  glow: number;
  rays: number;
  /** Сколько облаков из пула видно и насколько они плотные. */
  clouds: number;
  cloudAlpha: number;
  /** 0 — тёмный фон, 1 — светлый: насколько усиливать обводку/тень платформ и героя. */
  contrast: number;
};

export const DOODLE_THEMES: readonly DoodleTheme[] = [
  { key: "warm", minScore: 0, top: "#2f2a22", bottom: "#1c1914", lines: 1, stars: 0, shootingStars: false, glow: 0, rays: 0, clouds: 0, cloudAlpha: 0, contrast: 0 },
  { key: "dawn", minScore: 500, top: "#1f2a5c", bottom: "#f2b48a", labelKey: "themeDawn", lines: 0, stars: 0.25, shootingStars: false, glow: 0, rays: 0, clouds: 3, cloudAlpha: 0.5, contrast: 0.55 },
  { key: "day", minScore: 1000, top: "#3f9be6", bottom: "#c4e6fb", labelKey: "themeDay", lines: 0, stars: 0, shootingStars: false, glow: 0, rays: 0, clouds: 7, cloudAlpha: 0.92, contrast: 1 },
  { key: "night", minScore: 2000, top: "#0b0f33", bottom: "#41256b", labelKey: "themeNight", lines: 0, stars: 1, shootingStars: true, glow: 0, rays: 0, clouds: 0, cloudAlpha: 0, contrast: 0.2 },
  { key: "heaven", minScore: 3000, top: "#f1d587", bottom: "#7fa6e8", labelKey: "themeHeaven", lines: 0, stars: 0.3, shootingStars: false, glow: 1, rays: 1, clouds: 4, cloudAlpha: 0.55, contrast: 0.75 },
];

/** Время, за которое фон полностью «доезжает» до новой темы (~95% за ~1.5 с, ~99% за ~2 с). */
export const THEME_TRANSITION_SECONDS = 1.7;
/** Сколько висит подпись при достижении порога. */
export const THEME_TOAST_MS = 1500;

/** Во сколько раз декор движется медленнее платформ (параллакс). */
const PARALLAX = { stars: 0.06, cloudsFar: 0.14, cloudsNear: 0.28, rays: 0.1 };

const CLOUD_COUNT = 7;
const STAR_COUNT = 34;
const RAY_COUNT = 5;

export function themeIndexForScore(score: number, themes: readonly DoodleTheme[] = DOODLE_THEMES): number {
  let index = 0;
  for (let i = 0; i < themes.length; i += 1) {
    if (score >= themes[i].minScore) index = i;
  }
  return index;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Доля пути к цели за `dt` секунд при экспоненциальном сглаживании: без рывков, независимо от FPS. */
export function easeFactor(dt: number, seconds = THEME_TRANSITION_SECONDS): number {
  const tau = seconds / 3.4;
  return 1 - Math.exp(-Math.max(0, dt) / tau);
}

function mod(value: number, span: number): number {
  return ((value % span) + span) % span;
}

type Cloud = { x: number; y: number; w: number; speed: number; near: boolean; alpha: number };
type Star = { x: number; y: number; size: number; phase: number; speed: number };

export class DoodleBackground {
  private readonly width: number;
  private readonly height: number;
  private readonly reducedMotion: boolean;
  private readonly rgb: Array<{ top: Rgb; bottom: Rgb }>;
  private target = 0;
  private time = 0;

  // Текущие (сглаженные) значения.
  private top: Rgb;
  private bottom: Rgb;
  private lines = 1;
  private stars = 0;
  private glow = 0;
  private rays = 0;
  private contrastValue = 0;

  private readonly clouds: Cloud[] = [];
  private readonly starPool: Star[] = [];
  private shooting = { active: false, x: 0, y: 0, t: 0, nextIn: 5 };

  constructor(width: number, height: number, reducedMotion: boolean) {
    this.width = width;
    this.height = height;
    this.reducedMotion = reducedMotion;
    this.rgb = DOODLE_THEMES.map((theme) => ({ top: hexToRgb(theme.top), bottom: hexToRgb(theme.bottom) }));
    this.top = [...this.rgb[0].top];
    this.bottom = [...this.rgb[0].bottom];

    for (let i = 0; i < CLOUD_COUNT; i += 1) {
      const near = i % 2 === 0;
      this.clouds.push({
        x: Math.random() * width,
        y: Math.random() * (height + 80),
        w: near ? 64 + Math.random() * 28 : 40 + Math.random() * 22,
        speed: (near ? 5 : 2.5) * (0.7 + Math.random() * 0.6),
        near,
        alpha: 0,
      });
    }
    for (let i = 0; i < STAR_COUNT; i += 1) {
      this.starPool.push({
        x: Math.random() * width,
        y: Math.random() * (height + 40),
        size: Math.random() < 0.2 ? 2 : 1.2,
        phase: Math.random() * Math.PI * 2,
        speed: 1.2 + Math.random() * 2.2,
      });
    }
  }

  /** Возвращает true, если порог пройден вверх (пора показать подпись). */
  setScore(score: number): boolean {
    const next = themeIndexForScore(score);
    if (next === this.target) return false;
    const advanced = next > this.target;
    this.target = next;
    return advanced;
  }

  get themeIndex(): number {
    return this.target;
  }

  /** 0..1: насколько платформам и герою нужна усиленная обводка на текущем фоне. */
  get contrast(): number {
    return this.contrastValue;
  }

  update(dt: number) {
    const step = Math.min(dt, 0.1);
    this.time += step;
    const k = easeFactor(step);
    const theme = DOODLE_THEMES[this.target];
    const colors = this.rgb[this.target];
    for (let i = 0; i < 3; i += 1) {
      this.top[i] = lerp(this.top[i], colors.top[i], k);
      this.bottom[i] = lerp(this.bottom[i], colors.bottom[i], k);
    }
    this.lines = lerp(this.lines, theme.lines, k);
    this.stars = lerp(this.stars, theme.stars, k);
    this.glow = lerp(this.glow, theme.glow, k);
    this.rays = lerp(this.rays, theme.rays, k);
    this.contrastValue = lerp(this.contrastValue, theme.contrast, k);

    for (let i = 0; i < this.clouds.length; i += 1) {
      const cloud = this.clouds[i];
      const goal = i < theme.clouds ? theme.cloudAlpha : 0;
      cloud.alpha = lerp(cloud.alpha, goal, k);
      if (!this.reducedMotion) {
        cloud.x += cloud.speed * step;
        if (cloud.x > this.width + cloud.w) cloud.x = -cloud.w;
      }
    }

    if (!this.reducedMotion && theme.shootingStars) {
      const s = this.shooting;
      if (s.active) {
        s.t += step / 0.7;
        if (s.t >= 1) {
          s.active = false;
          s.nextIn = 4 + Math.random() * 5;
        }
      } else {
        s.nextIn -= step;
        if (s.nextIn <= 0) {
          s.active = true;
          s.t = 0;
          s.x = this.width * (0.35 + Math.random() * 0.6);
          s.y = Math.random() * this.height * 0.35;
        }
      }
    } else {
      this.shooting.active = false;
    }
  }

  private rgbString(c: Rgb): string {
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  }

  draw(ctx: CanvasRenderingContext2D, cameraY: number) {
    const { width, height } = this;
    // Декор едет вниз, когда герой поднимается; reduced motion — декор стоит на месте.
    const lift = this.reducedMotion ? 0 : -cameraY;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, this.rgbString(this.top));
    gradient.addColorStop(1, this.rgbString(this.bottom));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (this.glow > 0.01) {
      const glow = ctx.createRadialGradient(width / 2, -20, 10, width / 2, -20, height * 0.9);
      glow.addColorStop(0, `rgba(255,236,160,${0.75 * this.glow})`);
      glow.addColorStop(1, "rgba(255,236,160,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    if (this.rays > 0.01) {
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * 0.25) * 0.05 + lift * 0.0004;
      ctx.fillStyle = `rgba(255,244,200,${0.13 * this.rays})`;
      for (let i = 0; i < RAY_COUNT; i += 1) {
        const angle = -0.62 + i * 0.31 + sway * (1 + i * 0.1);
        const spread = 0.07;
        ctx.beginPath();
        ctx.moveTo(width / 2, -20);
        ctx.lineTo(width / 2 + Math.tan(angle - spread) * height * 1.3, height);
        ctx.lineTo(width / 2 + Math.tan(angle + spread) * height * 1.3, height);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (this.lines > 0.01) {
      ctx.strokeStyle = `rgba(220,184,103,${0.12 * this.lines})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 0; y < height; y += 24) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    if (this.stars > 0.01) {
      ctx.fillStyle = "#ffffff";
      const span = height + 40;
      for (const star of this.starPool) {
        const twinkle = this.reducedMotion ? 0.85 : 0.6 + 0.4 * Math.sin(this.time * star.speed + star.phase);
        ctx.globalAlpha = this.stars * twinkle;
        const y = mod(star.y + lift * PARALLAX.stars, span) - 20;
        ctx.fillRect(star.x, y, star.size, star.size);
      }
      ctx.globalAlpha = 1;
    }

    const s = this.shooting;
    if (s.active) {
      const x = s.x - s.t * 150;
      const y = s.y + s.t * 90;
      const fade = Math.sin(Math.PI * s.t);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 34, y - 20);
      ctx.stroke();
    }

    const cloudSpan = height + 120;
    for (const cloud of this.clouds) {
      if (cloud.alpha < 0.01) continue;
      const factor = cloud.near ? PARALLAX.cloudsNear : PARALLAX.cloudsFar;
      const y = mod(cloud.y + lift * factor, cloudSpan) - 60;
      const h = cloud.w * 0.32;
      ctx.fillStyle = `rgba(255,255,255,${cloud.alpha * (cloud.near ? 1 : 0.75)})`;
      ctx.beginPath();
      ctx.ellipse(cloud.x, y, cloud.w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.x - cloud.w * 0.26, y + h * 0.12, cloud.w * 0.3, h * 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.x + cloud.w * 0.28, y + h * 0.1, cloud.w * 0.33, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
