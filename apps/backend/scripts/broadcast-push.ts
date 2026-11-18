/**
 * Разовая рассылка push-уведомления ВСЕМ подписанным устройствам (например, «мы переехали на новый сайт»).
 *
 *   npx ts-node scripts/broadcast-push.ts          # сухой прогон: только считает получателей, ничего не отправляет
 *   npx ts-node scripts/broadcast-push.ts --send   # реально отправляет
 *
 * БД — из DATABASE_URL (apps/backend/.env), VAPID-ключи — из WEB_PUSH_* (apps/backend/.env, затем ../../.env.development).
 * Ключи должны совпадать с теми, с которыми браузеры подписывались на сервере, иначе пуш-сервисы ответят 401/403.
 * Скрипт ничего не удаляет из БД: недействительные подписки (404/410) только считаются и выводятся в отчёте.
 *
 * Текст и ссылку можно переопределить: PUSH_TITLE, PUSH_BODY, PUSH_URL (путь на ЭТОМ сайте, по умолчанию /chat).
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as webPush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.development') });

const TITLE = process.env.PUSH_TITLE ?? 'Christ App переехал на новый сайт';
const BODY =
  process.env.PUSH_BODY ??
  'Мы переехали: https://christapp.ddns.net. Этот сайт скоро перестанет работать. Переходите на новый!';
/** Путь на старом сайте: клик откроет приложение, где показывается окно с кнопкой перехода на новый адрес. */
const TARGET_URL = process.env.PUSH_URL ?? '/chat';
const CONCURRENCY = 8;
const TTL_SECONDS = 24 * 60 * 60;

async function main() {
  const send = process.argv.includes('--send');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const subs = await prisma.pushSubscription.findMany({
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });
    const users = new Set(subs.map((s) => s.userId));
    console.log(`Подписок (устройств): ${subs.length}, пользователей: ${users.size}`);
    console.log(`Заголовок: ${TITLE}`);
    console.log(`Текст:     ${BODY}`);
    console.log(`Ссылка:    ${TARGET_URL}`);

    if (!send) {
      console.log('\nСухой прогон: ничего не отправлено. Для отправки добавьте --send.');
      return;
    }

    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
    if (!publicKey || !privateKey) {
      throw new Error('Не заданы WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY');
    }
    webPush.setVapidDetails(
      process.env.WEB_PUSH_SUBJECT?.trim() || 'mailto:notifications@christapp.local',
      publicKey,
      privateKey,
    );

    const createdAt = new Date().toISOString();
    const stamp = Date.now();
    const stats = { ok: 0, gone: 0, failed: 0 };
    const errors: Record<string, number> = {};

    let next = 0;
    const worker = async () => {
      while (next < subs.length) {
        const sub = subs[next++];
        // Формат полезной нагрузки — тот же, что ждёт sw.js (parsePushPayload).
        const payload = JSON.stringify({
          title: TITLE,
          body: BODY,
          targetUrl: TARGET_URL,
          roomId: 'migration',
          senderId: 'system',
          createdAt,
          messageId: `migration-${stamp}-${sub.id}`,
        });
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: TTL_SECONDS, urgency: 'high' },
          );
          stats.ok += 1;
        } catch (e: unknown) {
          const status =
            e && typeof e === 'object' && 'statusCode' in e
              ? Number((e as { statusCode: unknown }).statusCode)
              : NaN;
          if (status === 404 || status === 410) {
            stats.gone += 1;
          } else {
            stats.failed += 1;
            const key = Number.isFinite(status) ? String(status) : 'network';
            errors[key] = (errors[key] ?? 0) + 1;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(
      `\nГотово: доставлено в пуш-сервисы ${stats.ok}, устарело (404/410) ${stats.gone}, ошибок ${stats.failed}`,
    );
    if (stats.failed) console.log('Ошибки по кодам:', errors);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
