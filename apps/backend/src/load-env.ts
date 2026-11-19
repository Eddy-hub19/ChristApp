import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Файлы окружения в корне монорепо, по убыванию приоритета: .env.local перекрывает .env.development. */
const ENV_FILE_NAMES = ['.env.local', '.env.development'];

/**
 * Ищет ближайшую папку вверх от `from` (до 4 уровней), где лежит хотя бы один из корневых env-файлов, и возвращает
 * существующие файлы. Бэкенд запускается из apps/backend, а настройки лежат в корне репозитория; в Docker
 * файлов нет (переменные приходят из compose), тогда возвращается пустой список.
 */
export function findEnvFiles(from: string = process.cwd()): string[] {
  let dir = resolve(from);
  for (let i = 0; i < 5; i++) {
    const found = ENV_FILE_NAMES.map((n) => resolve(dir, n)).filter(existsSync);
    if (found.length) return found;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return [];
}

/**
 * Читает корневые .env.local и .env.development в process.env. Уже заданные переменные окружения (Docker, CI)
 * не перезаписываются, а при совпадении ключей побеждает .env.local.
 */
export function loadEnv(): string[] {
  const files = findEnvFiles();
  if (files.length) config({ path: files, quiet: true });
  return files;
}

loadEnv();
