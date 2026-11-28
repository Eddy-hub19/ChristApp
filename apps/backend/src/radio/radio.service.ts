import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { PrismaService } from 'src/prisma/prisma.service';
import { advanceStation, nextTrackId, trackEndsAt, type RadioPosition } from './radio.schedule';

const STATE_ID = 'main';
const RECENT_LIMIT = 10;

export interface RadioTrackDto {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  audioUrl: string;
  durationSec: number;
}

export interface RadioStateDto {
  /** false - очередь пуста, эфир офлайн. */
  online: boolean;
  track: RadioTrackDto | null;
  startedAtMs: number | null;
  /** Время сервера в момент ответа: клиент по нему считает сдвиг своих часов. */
  serverNow: number;
}

type Track = RadioTrackDto & { position: number };

/**
 * «Christ Radio»: единый эфир. Сервер - источник истины: хранит, какой трек и с какого момента играет,
 * сам переключает треки по таймеру (при рестарте догоняет по времени) и сообщает об изменениях подписчикам.
 * Расписание в памяти одного процесса: при нескольких инстансах бэкенда нужен общий лидер (см. отчёт).
 */
@Injectable()
export class RadioService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RadioService.name);
  private readonly events = new EventEmitter();
  private queue: Track[] = [];
  private position: RadioPosition | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.reload();
    } catch (err) {
      // таблицы ещё не созданы (миграция не применена) - приложение должно подняться, эфир будет офлайн
      this.log.warn(`Radio disabled until DB is ready: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.events.removeAllListeners();
  }

  /** Подписка на смену трека/очереди (для сокет-шлюза). */
  onChange(listener: (state: RadioStateDto) => void) {
    this.events.on('change', listener);
    return () => this.events.off('change', listener);
  }

  /** Операции над очередью выполняются строго по одной, чтобы позиции не гонялись друг с другом. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.busy.then(job, job);
    this.busy = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getState(now = Date.now()): RadioStateDto {
    const track = this.position ? (this.queue.find((t) => t.id === this.position!.trackId) ?? null) : null;
    return {
      online: Boolean(track),
      track: track ? this.publicTrack(track) : null,
      startedAtMs: track && this.position ? this.position.startedAtMs : null,
      serverNow: now,
    };
  }

  listTracks(): Track[] {
    return this.queue.map((t) => ({ ...t }));
  }

  async recent() {
    const rows = await this.prisma.radioPlay.findMany({ orderBy: { startedAt: 'desc' }, take: RECENT_LIMIT });
    return rows.map((r) => ({ id: r.id, title: r.title, artist: r.artist, coverUrl: r.coverUrl, startedAtMs: r.startedAt.getTime() }));
  }

  async addTrack(input: { title: string; artist: string; audioUrl: string; coverUrl: string | null; durationSec: number }) {
    return this.serial(async () => {
      const last = await this.prisma.radioTrack.findFirst({ orderBy: { position: 'desc' }, select: { position: true } });
      const row = await this.prisma.radioTrack.create({ data: { ...input, position: (last?.position ?? -1) + 1 } });
      await this.sync();
      return row;
    });
  }

  /** Удаляет трек; если он играл - эфир сразу переходит на следующий. */
  async deleteTrack(id: string): Promise<boolean> {
    return this.serial(async () => {
      const exists = await this.prisma.radioTrack.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return false;
      const wasCurrent = this.position?.trackId === id;
      const next = wasCurrent ? nextTrackId(this.asQueue(), id) : null;
      await this.prisma.radioTrack.delete({ where: { id } });
      await this.normalizePositions();
      await this.sync({ forceStartFrom: wasCurrent ? (next === id ? null : next) : undefined, restart: wasCurrent });
      return true;
    });
  }

  async move(id: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.serial(async () => {
      const ids = (await this.ordered()).map((t) => t.id);
      const i = ids.indexOf(id);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ids.length) return i >= 0;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await this.writeOrder(ids);
      await this.sync();
      return true;
    });
  }

  /**
   * Переключает эфир сразу: на `id` или (без него) на следующий по кругу трек; новый трек стартует с начала.
   * В очереди из одного трека «следующий» - он же, играет заново. false - такого трека нет или эфир офлайн.
   */
  async switchTo(id?: string): Promise<boolean> {
    return this.serial(async () => {
      if (this.queue.length === 0) return false;
      const target = id ?? nextTrackId(this.asQueue(), this.position?.trackId ?? null);
      if (!target || !this.queue.some((t) => t.id === target)) return false;
      await this.sync({ forceStartFrom: target, restart: true });
      return true;
    });
  }

  /** «Играть следующим»: трек встаёт сразу за текущим. */
  async playNext(id: string): Promise<boolean> {
    return this.serial(async () => {
      const ids = (await this.ordered()).map((t) => t.id);
      if (!ids.includes(id)) return false;
      const currentId = this.position?.trackId;
      if (currentId && currentId !== id) {
        const rest = ids.filter((x) => x !== id);
        rest.splice(rest.indexOf(currentId) + 1, 0, id);
        await this.writeOrder(rest);
      }
      await this.sync();
      return true;
    });
  }

  async reload() {
    return this.serial(async () => {
      const row = await this.prisma.radioState.findUnique({ where: { id: STATE_ID } });
      this.position =
        row?.currentTrackId && row.startedAt ? { trackId: row.currentTrackId, startedAtMs: row.startedAt.getTime() } : null;
      await this.sync({ silent: true });
    });
  }

  private publicTrack(t: Track): RadioTrackDto {
    return { id: t.id, title: t.title, artist: t.artist, coverUrl: t.coverUrl, audioUrl: t.audioUrl, durationSec: t.durationSec };
  }

  private asQueue() {
    return this.queue.map((t) => ({ id: t.id, durationMs: t.durationSec * 1000 }));
  }

  private async ordered() {
    return this.prisma.radioTrack.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  }

  private async writeOrder(ids: string[]) {
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.radioTrack.update({ where: { id }, data: { position } })));
  }

  private async normalizePositions() {
    await this.writeOrder((await this.ordered()).map((t) => t.id));
  }

  /**
   * Перечитывает очередь, приводит позицию эфира к текущему моменту, сохраняет и (если трек сменился) оповещает.
   * `restart` - текущий трек удалён: эфир начинается заново с `forceStartFrom` (или с первого).
   */
  private async sync(opts: { silent?: boolean; forceStartFrom?: string | null; restart?: boolean } = {}) {
    const before = this.position;
    this.queue = (await this.ordered()).map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      coverUrl: t.coverUrl,
      audioUrl: t.audioUrl,
      durationSec: t.durationSec,
      position: t.position,
    }));
    const now = Date.now();
    const current = opts.restart ? null : this.position;
    const after = advanceStation(this.asQueue(), current, now, opts.forceStartFrom);
    this.position = after;
    const changed = before?.trackId !== after?.trackId || before?.startedAtMs !== after?.startedAtMs;
    if (changed) await this.persist(after);
    this.arm();
    // очередь могла измениться и без смены трека (порядок/новый трек): клиентам полезно знать и об этом
    if (!opts.silent) this.events.emit('change', this.getState());
  }

  private async persist(pos: RadioPosition | null) {
    const startedAt = pos ? new Date(pos.startedAtMs) : null;
    await this.prisma.radioState.upsert({
      where: { id: STATE_ID },
      create: { id: STATE_ID, currentTrackId: pos?.trackId ?? null, startedAt },
      update: { currentTrackId: pos?.trackId ?? null, startedAt },
    });
    const track = pos ? this.queue.find((t) => t.id === pos.trackId) : null;
    if (pos && track) {
      await this.prisma.radioPlay.create({
        data: { trackId: track.id, title: track.title, artist: track.artist, coverUrl: track.coverUrl, startedAt: new Date(pos.startedAtMs) },
      });
    }
  }

  private arm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const end = trackEndsAt(this.asQueue(), this.position);
    if (end === null) return;
    // +50 мс, чтобы таймер не сработал чуть раньше границы и не прошёл вхолостую
    const delay = Math.min(Math.max(end - Date.now() + 50, 50), 2_000_000_000);
    this.timer = setTimeout(() => {
      this.serial(() => this.sync()).catch((err) => this.log.warn(`Radio tick failed: ${err instanceof Error ? err.message : String(err)}`));
    }, delay);
    this.timer.unref?.();
  }
}
