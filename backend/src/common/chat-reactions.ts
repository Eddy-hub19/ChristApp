/** Єдиний набір реакцій, що пропонується в меню повідомлень в усіх чатах (основні кімнати й Киношка). */
export const CHAT_REACTIONS = [
  '❤️',
  '😂',
  '🔥',
  '🙏',
  '😮',
  '👏',
  '😭',
  '🕊️',
] as const;

/** Реакції, які раніше пропонував основний чат: лишаються валідними, щоб їх можна було зняти. */
const LEGACY_CHAT_REACTIONS = ['🤍', '🥲', '🙏🏻'] as const;

export const ACCEPTED_CHAT_REACTIONS: ReadonlySet<string> = new Set([
  ...CHAT_REACTIONS,
  ...LEGACY_CHAT_REACTIONS,
]);
