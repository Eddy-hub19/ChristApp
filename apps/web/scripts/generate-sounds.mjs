/**
 * ОДНОРАЗОВЫЙ скрипт: генерирует недостающие звуки «Отари» через ElevenLabs Sound Effects и кладёт .mp3 в
 * public/sounds/flock/. Не вызывается при сборке и в рантайме приложения (в приложении нет обращений к ElevenLabs).
 *
 *   node scripts/generate-sounds.mjs            # все звуки из списка, у которых ещё нет файла
 *   node scripts/generate-sounds.mjs eat-cell   # только указанные
 *
 * Ключ ELEVENLABS_API_KEY читается ТОЛЬКО из локального .env (frontend/.env.local, frontend/.env или ../.env), который не
 * коммитится; значение нигде не печатается. Нет ключа - скрипт ничего не делает.
 * После генерации: добавьте `file: "/sounds/flock/<имя>"` в flockSoundDefs.ts и запишите файл, промпт и дату в
 * public/sounds/flock/CREDITS.md и docs/sound-licenses.md. Права на сгенерированное зависят от тарифа аккаунта
 * ElevenLabs - владелец должен проверить условия коммерческого использования.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sounds", "flock");

const COMMON = "casual mobile game, soft, short, no music, no voice";
/** name: [prompt, duration in seconds] */
const SOUNDS = {
  "eat-cell": [`Soft low gulp, deep gentle chomp, ${COMMON}`, 0.6],
  eaten: [`Soft descending sad blip, gentle, ${COMMON}`, 0.8],
  "bonus-end": [`Quiet descending soft tone fading away, ${COMMON}`, 0.8],
  split: [`Soft quick stretchy pop, split, ${COMMON}`, 0.5],
  throw: [`Tiny soft airy toss whoosh, ${COMMON}`, 0.4],
  "spawn-boost": [`Short soft rising air swoosh, speed boost, ${COMMON}`, 1.0],
  burn: [`Soft sizzling hiss of something burning in lava, ${COMMON}`, 1.2],
  "star-fall": [`Tiny falling star whistle ending with a light twinkle chime, ${COMMON}`, 1.2],
  pipe: [`Two soft wooden flute notes, rising, shepherd pipe, ${COMMON}`, 1.0],
  freeze: [`Crystal ice chime, glassy freeze sparkle, ${COMMON}`, 1.2],
};

function readKey() {
  for (const f of [join(root, ".env.local"), join(root, ".env"), join(root, "..", ".env")]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^ELEVENLABS_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return process.env.ELEVENLABS_API_KEY ?? "";
}

const key = readKey();
if (!key) {
  console.log("ELEVENLABS_API_KEY не найден в локальном .env - добавьте ELEVENLABS_API_KEY=... (файл не коммитится). Выход.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const wanted = process.argv.slice(2);
for (const [name, [text, seconds]] of Object.entries(SOUNDS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const file = join(outDir, `${name}.mp3`);
  if (existsSync(file)) {
    console.log(`skip ${name} (уже есть)`);
    continue;
  }
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_64", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.5 }),
  });
  if (!res.ok) {
    console.error(`fail ${name}: HTTP ${res.status}`);
    continue;
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`ok ${name} -> ${file}  (prompt: ${text}; ${seconds}s; ${new Date().toISOString().slice(0, 10)})`);
}
