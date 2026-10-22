import { isAdminDashboardUsername } from './admin-dashboard';

/**
 * Стили пузырей сообщений. Новый стиль = id здесь + такой же id в frontend/src/lib/bubbleStyles.ts
 * (и CSS-переменные в frontend/src/styles/bubbleStyles.scss). "default" - обычный пузырь.
 */
export const BUBBLE_STYLE_IDS = [
  'default',
  'lamb',
  'dove',
  'lion',
  'vine',
] as const;
export type BubbleStyleId = (typeof BUBBLE_STYLE_IDS)[number];
export const DEFAULT_BUBBLE_STYLE: BubbleStyleId = 'default';

export const isBubbleStyleId = (v: unknown): v is BubbleStyleId =>
  typeof v === 'string' && (BUBBLE_STYLE_IDS as readonly string[]).includes(v);

/**
 * Тестовый режим: "admin" - стили (и их выбор) доступны только админу, "all" - всем. Переключается одной правкой.
 * Дзеркало: frontend/src/lib/bubbleStyles.ts (BUBBLE_STYLES_ACCESS).
 */
export const BUBBLE_STYLES_ACCESS: 'admin' | 'all' = 'admin';

export function canUseBubbleStyles(username: string | null | undefined) {
  return BUBBLE_STYLES_ACCESS === 'all' || isAdminDashboardUsername(username);
}
