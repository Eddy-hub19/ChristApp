/**
 * Какие скины показывать в лобби. Скрытые (`hidden` с сервера: FlockMe.config.hiddenSkins) не видны и не продаются,
 * но если игрок уже владеет скином - он остаётся в списке и доступен для игры.
 * Пока профиль не загружен (`owned` = null), скрытые не показываем: купить всё равно нельзя.
 */
export function visibleSkinIds(ids: readonly number[], hidden: readonly number[], owned: readonly number[] | null): number[] {
  return ids.filter((id) => !hidden.includes(id) || (owned?.includes(id) ?? false));
}
