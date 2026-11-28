/**
 * Звірка сітки лабіринту сервера з клієнтом: друкує хеш геометрії для seed 1..N (за замовчуванням 1000).
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/maze-hash.ts [N] > server-hashes.txt
 * Клієнт (копія flock.maze.grid.ts) друкує той самий формат рядків `seed hash`; файли мають збігтися бит-в-бит.
 */
import { FLOCK_CONFIG as C } from '../src/flock/flock.config';
import { buildMaze } from '../src/flock/flock.maze.grid';
import { mazeParams } from '../src/flock/flock.maze';

const n = Number(process.argv[2] ?? 1000);
for (let i = 1; i <= n; i++) {
  const seed = (Math.imul(i, 2654435761) >>> 0) ^ 0x5bd1e995;
  const g = buildMaze(mazeParams(seed >>> 0));
  // eslint-disable-next-line no-console
  console.log(`${seed >>> 0} ${g.hash} ${g.path.length} ${g.checkpoints.join(',')} ${g.salt}`);
}
void C;
