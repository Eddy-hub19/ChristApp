/**
 * Одноразова міграція даних: старі відповіді (`[[reply:<json>]]<текст>` у Message.content) →
 * новий формат (Message.replyToId + чистий текст).
 *
 *   npx ts-node scripts/migrate-legacy-replies.ts            # сухий прогін: лише рахує, нічого не пише
 *   npx ts-node scripts/migrate-legacy-replies.ts --apply    # реально змінює БД
 *
 * Свідомо НЕ Prisma-міграція: `prisma migrate deploy` виконується автоматично при деплої
 * (build:vercel), а цю зміну даних треба запускати руками після перегляду сухого прогону.
 *
 * Що робить із кожним повідомленням, що починається з "[[reply:":
 *  - оригінал (id з префікса) існує в ТІЙ САМІЙ кімнаті → content = чистий текст, replyToId = id оригіналу;
 *  - оригіналу нема (видалений або id не збігся) → НЕ чіпаємо: інакше зникла б збережена цитата;
 *  - префікс не розбирається / після нього порожньо → НЕ чіпаємо.
 * Ідемпотентно: вже сконвертовані повідомлення більше не починаються з префікса.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  LEGACY_REPLY_PREFIX,
  parseLegacyReplyPrefix,
} from '../src/common/legacy-reply-prefix';

const BATCH = 200;

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const counts = {
    legacy: 0,
    convertible: 0,
    skippedNoOriginal: 0,
    skippedUnparseable: 0,
    converted: 0,
  };

  try {
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.message.findMany({
        where: { content: { startsWith: LEGACY_REPLY_PREFIX } },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, roomId: true, content: true },
      });
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;
      counts.legacy += rows.length;

      const parsed = rows.map((row) => ({
        row,
        ...parseLegacyReplyPrefix(row.content),
      }));
      const originalIds = [
        ...new Set(parsed.map((p) => p.meta?.id).filter(Boolean)),
      ] as string[];
      const originals = originalIds.length
        ? await prisma.message.findMany({
            where: { id: { in: originalIds } },
            select: { id: true, roomId: true },
          })
        : [];
      const roomOfOriginal = new Map(originals.map((o) => [o.id, o.roomId]));

      const updates: Array<{ id: string; content: string; replyToId: string }> =
        [];
      for (const p of parsed) {
        if (!p.meta || !p.text.trim()) {
          counts.skippedUnparseable++;
        } else if (roomOfOriginal.get(p.meta.id) !== p.row.roomId) {
          counts.skippedNoOriginal++;
        } else {
          counts.convertible++;
          updates.push({
            id: p.row.id,
            content: p.text,
            replyToId: p.meta.id,
          });
        }
      }

      if (apply && updates.length) {
        await prisma.$transaction(
          updates.map((u) =>
            prisma.message.update({
              where: { id: u.id },
              data: { content: u.content, replyToId: u.replyToId },
            }),
          ),
        );
        counts.converted += updates.length;
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(apply ? 'APPLIED' : 'DRY RUN (nothing written)');
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
