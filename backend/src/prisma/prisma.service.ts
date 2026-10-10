import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolvePoolSettings } from './db-info';
import { DbQueryStats, queryLabel } from './db-query-stats';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit
{
  /** Пул pg: доступний для діагностики (адмін-панель «Процеси» показує його заповненість). */
  readonly pool: Pool;
  /** Лічильник запитів за 5 хвилин: графік і топ-5 в адмінці. */
  readonly queryStats = new DbQueryStats();

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // connection_limit / pool_timeout з URL тут не діють (driver adapter): пул налаштовується лише так.
      ...resolvePoolSettings(),
      keepAlive: true,
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
    });
    this.pool = pool;

    // DB_QUERY_LOG=1 - кожен запит у stdout з часом виконання (для діагностики, у проді вимкнено).
    const verbose = process.env.DB_QUERY_LOG === '1';
    const log = new Logger('DbQuery');
    this.$on('query', (e) => {
      this.queryStats.record(e.query, e.duration);
      if (verbose) log.log(`${e.duration}ms ${queryLabel(e.query)}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
