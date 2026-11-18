import type { PrismaService } from 'src/prisma/prisma.service';
import { resolveRoomAccess, type RoomAccess } from './user-may-post-to-room';

/** Скільки живе позитивний результат: далі перечитуємо з БД. Вихід із кімнати скидає запис одразу (`invalidate`). */
export const ROOM_ACCESS_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 5_000;

type Resolver = (
  prisma: PrismaService,
  userId: string,
  roomId: string,
) => Promise<RoomAccess | null>;

/**
 * Кеш «чи має користувач доступ до кімнати» для частих сокет-подій (набір тексту, перегляд кімнати, ігровий heartbeat,
 * ходи Snake): без нього кожна така подія коштувала 2-3 запити до БД. Кешуємо лише ТАК (відмова перевіряється щоразу -
 * щойно доданий учасник одразу отримує доступ), одночасні запити однієї пари зливаються в один.
 * Дії з наслідками (надсилання, редагування, запрошення) кеш не використовують - вони перевіряють БД.
 */
export class RoomAccessCache {
  private readonly entries = new Map<
    string,
    { access: RoomAccess; until: number }
  >();
  private readonly inflight = new Map<string, Promise<RoomAccess | null>>();

  constructor(
    private readonly resolver: Resolver = resolveRoomAccess,
    private readonly ttlMs = ROOM_ACCESS_TTL_MS,
    private readonly clock: () => number = Date.now,
  ) {}

  private key(userId: string, roomId: string) {
    return `${userId}:${roomId}`;
  }

  async resolve(
    prisma: PrismaService,
    userId: string,
    roomId: string,
  ): Promise<RoomAccess | null> {
    const key = this.key(userId, roomId);
    const hit = this.entries.get(key);
    if (hit && hit.until > this.clock()) return hit.access;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const load = this.resolver(prisma, userId, roomId)
      .then((access) => {
        if (access) this.remember(key, access);
        else this.entries.delete(key);
        return access;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, load);
    return load;
  }

  /** Користувач залишив кімнату (або його видалили): наступна подія перевірить БД. */
  invalidate(userId: string, roomId: string) {
    this.entries.delete(this.key(userId, roomId));
  }

  private remember(key: string, access: RoomAccess) {
    if (this.entries.size >= MAX_ENTRIES) {
      const now = this.clock();
      for (const [k, v] of this.entries) {
        if (v.until <= now) this.entries.delete(k);
      }
      // усе ще повно: викидаємо найстаріші (Map зберігає порядок вставки)
      for (const k of this.entries.keys()) {
        if (this.entries.size < MAX_ENTRIES) break;
        this.entries.delete(k);
      }
    }
    this.entries.set(key, { access, until: this.clock() + this.ttlMs });
  }
}
