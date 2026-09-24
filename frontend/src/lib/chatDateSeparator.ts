/**
 * Роздільники дат у стрічці повідомлень (як у Telegram):
 * «Сьогодні», «Вчора», назва дня тижня для останнього тижня, далі — конкретна дата.
 * Мова дат береться з поточної локалі застосунку.
 */

/** Застосунок використовує код "ua", але Intl знає українську лише як "uk". */
const APP_LANG_TO_INTL_LOCALE: Record<string, string> = {
  en: "en",
  ru: "ru",
  ua: "uk",
};

export function intlLocaleForAppLang(lang: string): string {
  return APP_LANG_TO_INTL_LOCALE[lang] ?? lang;
}

/** Ключ локального дня (не UTC — інакше межа доби з'їжджає на кілька годин). */
export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Скільки повних календарних днів між двома датами (0 — той самий день). */
export function localDaysApart(earlier: Date, later: Date): number {
  return Math.round(
    (startOfLocalDay(later) - startOfLocalDay(earlier)) / MS_PER_DAY,
  );
}

export type ChatDateSeparatorLabels = {
  today: string;
  yesterday: string;
};

export function formatChatDateSeparator(
  messageDate: Date,
  now: Date,
  lang: string,
  labels: ChatDateSeparatorLabels,
): string {
  const locale = intlLocaleForAppLang(lang);
  const daysApart = localDaysApart(messageDate, now);

  if (daysApart <= 0) {
    return labels.today;
  }
  if (daysApart === 1) {
    return labels.yesterday;
  }
  if (daysApart < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
      messageDate,
    );
  }

  const isSameYear = messageDate.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(isSameYear ? {} : { year: "numeric" }),
  }).format(messageDate);
}
