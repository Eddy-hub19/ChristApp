/** Посилання-запрошення в «Отару» і способи ним поділитись. */

export function buildFlockInviteUrl(origin: string, locale: string, arenaId: number | null): string {
  const base = `${origin.replace(/\/+$/, "")}/${locale}/games/flock`;
  return arenaId && arenaId > 0 ? `${base}?arena=${arenaId}` : base;
}

export type ShareResult = "shared" | "cancelled" | "copied" | "failed";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* падаємо на запасний варіант нижче */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function canUseWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Web Share API (на телефоні системне "Поділитися"), інакше - копіювання посилання. */
export async function shareInvite(data: { url: string; title: string; text: string }): Promise<ShareResult> {
  if (canUseWebShare()) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // інша помилка (немає дозволу тощо) - пробуємо скопіювати
    }
  }
  return (await copyText(data.url)) ? "copied" : "failed";
}
