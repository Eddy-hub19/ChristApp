/**
 * Связка «игра -> звук»: события модели превращаются в звуки реестра, покадровый tick ведёт петли (рывок, ветер, дождь).
 * Вся логика «какой звук на какое событие» - здесь; сами синтезаторы - в flockSoundDefs.ts.
 */
import type { FlockModel, ModelSoundSink } from "./flockModel";
import { playFlockSound, setFlockSkyMusic, setFlockSoundListener, startFlockLoop, stopFlockLoop } from "./flockSound";

const FOOD_SOUND = ["eatGrass", "eatFlower", "eatFlower", "eatFlower", "rainbow"] as const;

const sink: ModelSoundSink = (kind, x, y, self, arg) => {
  const o = { x, y, self };
  switch (kind) {
    case "food":
      playFlockSound(FOOD_SOUND[Number(arg)] ?? "eatGrass", o);
      break;
    case "eatCell":
    case "eaten":
    case "split":
    case "throw":
    case "spawnBoost":
    case "freeze":
    case "pipe":
    case "starPick":
    case "scissors":
    case "burn":
    case "fall":
    case "phrase":
      playFlockSound(kind, o);
      break;
    case "starFall":
      playFlockSound("starFall", { ...o, delayMs: Number(arg) || 0 });
      break;
    case "bonus":
      // у «Ножиць» и «Сопілки» свои звуки (событие/эффект на клетке)
      if (arg === "wings") playFlockSound("wingsPick", o);
      else if (arg !== "scissors" && arg !== "pipe") playFlockSound("bonus", o);
      break;
    case "bonusEnd":
      playFlockSound(arg === "wings" ? "wingsEnd" : "bonusEnd", o);
      break;
  }
};

/** Подключает звуки к модели арены. */
export function attachFlockSounds(model: FlockModel) {
  model.sound = sink;
}

let sprintOn = false;
let windOn = false;
let rainLevel = 0;
let skyOn = false;
let lastFlap = 0;

/** Покадровое: слушатель (камера) и петли. Вызывать из цикла отрисовки. */
export function tickFlockSound(model: FlockModel, now: number) {
  setFlockSoundListener(model.camX, model.camY, model.camR);

  if (model.sprintActive !== sprintOn) {
    sprintOn = model.sprintActive;
    if (sprintOn) startFlockLoop("sprint");
    else stopFlockLoop("sprint");
  }

  const wind = model.windStatus(now);
  const w = wind?.phase === "active";
  if (w !== windOn) {
    windOn = w;
    if (w) startFlockLoop("wind");
    else stopFlockLoop("wind");
  }

  // «Небо»: фон-хор (лише на цій карті, підпорядкований «Фоновим звукам»), вхід на карту й шелест крилець
  const sky = model.sky !== null;
  if (sky !== skyOn) {
    skyOn = sky;
    // музыка карты (melody2.mp3, ленивая загрузка; без неё - тихий синтезированный хор)
    setFlockSkyMusic(sky);
    if (sky) playFlockSound("skyEnter", { self: true });
  }
  if (sky && model.hasEffect("wings") && now - lastFlap > 420) {
    lastFlap = now;
    playFlockSound("wingsFlap", { self: true });
  }

  const rain = Math.round(model.rainStrength(now) * 5) / 5;
  if (rain !== rainLevel) {
    rainLevel = rain;
    if (rain > 0) startFlockLoop("rain", rain);
    else stopFlockLoop("rain");
  }
}

/** Игра закрылась/окончилась: сбрасываем петли. */
export function resetFlockSoundLoops() {
  sprintOn = false;
  windOn = false;
  rainLevel = 0;
  skyOn = false;
  setFlockSkyMusic(false);
  stopFlockLoop("sprint");
  stopFlockLoop("wind");
  stopFlockLoop("rain");
}
