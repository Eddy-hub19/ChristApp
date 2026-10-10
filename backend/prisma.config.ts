import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma ORM 7+: URL для миграций и CLI задаётся здесь (не в schema.prisma).
 * Задайте DATABASE_URL в backend/.env или в окружении (см. .env.example).
 *
 * Миграции не работают через PgBouncer (пулер Neon, хост с `-pooler`): если приложение ходит в базу через пулер,
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
