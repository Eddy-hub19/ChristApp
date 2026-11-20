#!/usr/bin/env node
/**
 * Перед `npm run dev` поднимает локальную Postgres (без Docker), если она настроена и не запущена.
 * Ничего не делает, когда папки данных нет (Docker, чужая база, CI) - тогда выходит молча.
 *
 * Переменные (необязательные): LOCAL_PG_DATA (по умолчанию ~/.local/christapp-pg), LOCAL_PG_PORT (5433),
 * PG_BIN (папка с pg_ctl и pg_isready; по умолчанию Homebrew postgresql@18, иначе PATH).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dataDir = process.env.LOCAL_PG_DATA || join(homedir(), '.local', 'christapp-pg');
const port = process.env.LOCAL_PG_PORT || '5433';
if (!existsSync(join(dataDir, 'PG_VERSION'))) process.exit(0);

const brewBin = '/opt/homebrew/opt/postgresql@18/bin';
const binDir = process.env.PG_BIN || (existsSync(brewBin) ? brewBin : '');
const bin = (name) => (binDir ? join(binDir, name) : name);

const ready = () =>
  spawnSync(bin('pg_isready'), ['-h', '127.0.0.1', '-p', port], { stdio: 'ignore' }).status === 0;

if (ready()) process.exit(0);

console.log(`[dev-db] локальная Postgres не запущена, стартую (${dataDir}, порт ${port})...`);
const started = spawnSync(bin('pg_ctl'), ['-D', dataDir, '-l', join(dataDir, 'server.log'), '-w', 'start'], {
  stdio: 'inherit',
});
if (started.error || started.status !== 0 || !ready()) {
  console.error(`[dev-db] не удалось запустить Postgres. Лог: ${join(dataDir, 'server.log')}`);
  // dev не блокируем: база может быть внешней
  process.exit(0);
}
console.log('[dev-db] Postgres запущена.');
