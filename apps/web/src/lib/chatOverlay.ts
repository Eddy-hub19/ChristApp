/** Картки чату поверх відео у fullscreen: як у прямих ефірах — максимум кілька, зникають самі. */

export const OVERLAY_MAX_CARDS = 3;
export const OVERLAY_TTL_MS = 8_000;
/** Останні мілісекунди життя картки — час на плавне згасання. */
export const OVERLAY_FADE_MS = 300;
const OVERLAY_TEXT_MAX = 240;

export type OverlayCard = {
  id: string;
  name: string;
  text: string;
  /** Імʼя автора повідомлення, на яке відповідають, — показуємо як «↩ імʼя». */
  replyName?: string;
  /** Службовий рядок (вийшов/зайшов): показується приглушено, без імені. */
  system?: boolean;
  expiresAt: number;
};

export type OverlayMessageInput = {
  id: string;
  content: string;
  user: { username: string; nickname: string | null };
  replyTo?: { deleted: true } | { deleted: false; username: string } | null;
};

function oneLine(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > OVERLAY_TEXT_MAX ? `${collapsed.slice(0, OVERLAY_TEXT_MAX)}…` : collapsed;
}

export function cardFromMessage(message: OverlayMessageInput, now: number): OverlayCard {
  return {
    id: message.id,
    name: message.user.nickname || message.user.username,
    text: oneLine(message.content),
    replyName: message.replyTo && !message.replyTo.deleted ? message.replyTo.username : undefined,
    expiresAt: now + OVERLAY_TTL_MS,
  };
}

export function isFading(card: OverlayCard, now: number): boolean {
  return card.expiresAt - now <= OVERLAY_FADE_MS;
}

/** Нова картка знизу; якщо «живих» більше за ліміт, найстарішу відправляємо на згасання. */
export function addCard(cards: OverlayCard[], card: OverlayCard, now: number): OverlayCard[] {
  if (cards.some((existing) => existing.id === card.id)) return cards;
  const next = [...cards, card];
  let active = next.filter((item) => !isFading(item, now));
  while (active.length > OVERLAY_MAX_CARDS) {
    const oldest = active[0];
    const index = next.indexOf(oldest);
    next[index] = { ...oldest, expiresAt: now + OVERLAY_FADE_MS };
    active = active.slice(1);
  }
  return next;
}

/** Редагування оновлює текст наявної картки (таймер не скидаємо). */
export function editCard(cards: OverlayCard[], id: string, content: string): OverlayCard[] {
  const text = oneLine(content);
  if (!cards.some((card) => card.id === id && card.text !== text)) return cards;
  return cards.map((card) => (card.id === id ? { ...card, text } : card));
}

/** Видалене повідомлення швидко згасає, а не висить до кінця таймера. */
export function removeCard(cards: OverlayCard[], id: string, now: number): OverlayCard[] {
  if (!cards.some((card) => card.id === id && !isFading(card, now))) return cards;
  return cards.map((card) => (card.id === id ? { ...card, expiresAt: now + OVERLAY_FADE_MS } : card));
}

export function pruneCards(cards: OverlayCard[], now: number): OverlayCard[] {
  const alive = cards.filter((card) => card.expiresAt > now);
  return alive.length === cards.length ? cards : alive;
}
