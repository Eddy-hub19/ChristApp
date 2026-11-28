/**
 * Точка подключения режима «Лабіринт» к серверу. Клієнтські модулі (сітка, відмальовка, HUD, карточка в «Режимах») готові й не
 * залежать від формату протоколу; склейка з сервером: 1) виставляє `mazeAdapter.join` (повідомлення входу в арену режиму),
 * 2) кладе `createMazeView(cfg з welcome)` у `model.maze`, 3) оновлює `RaceHudData` / `RaceResults` із пакетів,
 * 4) перемикає MAZE_MODE_READY у true - тоді карточка режиму зʼявляється в окні «Режими».
 */
export const MAZE_MODE_READY = true;

export const mazeAdapter: { join: (() => void) | null } = { join: null };
