const ADMIN_PANEL_USERNAMES = new Set(["neskai"]);

/**
 * Сторінка /admin і кнопка в чат-листі — лише для вказаних @username.
 */
export function canSeeAdminPanelNav(
  username: string | undefined | null,
): boolean {
  const u = username?.trim().toLowerCase();
  return Boolean(u && ADMIN_PANEL_USERNAMES.has(u));
}
