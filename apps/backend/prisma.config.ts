import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Корневые .env.local / .env.development (как в src/load-env.ts). Файл самодостаточный: в Docker его копируют отдельно
 * от src/ (npm ci -> prisma generate читает конфиг до копирования исходников), поэтому src/load-env здесь импортировать нельзя.
 * В образе корневых файлов нет, переменные приходят из окружения.
 */
function loadRootEnv() {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 5; i++) {
    const found = ['.env.local', '.env.development']
      .map((n) => resolve(dir, n))
      .filter(existsSync);
    if (found.length) {
      loadDotenv({ path: found, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadRootEnv();

/**
 * Prisma ORM 7+: URL для миграций и CLI задаётся здесь (не в schema.prisma).
 * Задайте DATABASE_URL в корневом .env.local или в окружении (см. .env.example).
 *
 * Миграции не работают через PgBouncer (пулер, хост с `-pooler`): если приложение ходит в базу через пулер,
 * задайте DIRECT_URL (прямой хост без `-pooler`) - CLI возьмёт его. Без DIRECT_URL всё как раньше.
 * Само приложение берёт подключение только из DATABASE_URL (см. PrismaService).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL?.trim() || env('DATABASE_URL'),
  },
});
