import { intlLocaleForAppLang, localDaysApart } from "./chatDateSeparator";

export type ReadAtLabels = {
  /** "сьогодні о {time}" */
  today: (time: string) => string;
  /** "вчора о {time}" */
  yesterday: (time: string) => string;
  /** "{date} о {time}" */
  other: (date: string, time: string) => string;
};

/** Час прочитання для списку «Переглянули»: «сьогодні о 13:05», «вчора о 22:10», далі — «12 жовт. о 09:30». */
export function formatReadAt(
  readAt: Date,
  now: Date,
  lang: string,
  labels: ReadAtLabels,
): string {
  const locale = intlLocaleForAppLang(lang);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(readAt);
  const daysApart = localDaysApart(readAt, now);
  if (daysApart <= 0) return labels.today(time);
  if (daysApart === 1) return labels.yesterday(time);
  const sameYear = readAt.getFullYear() === now.getFullYear();
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(readAt);
  return labels.other(date, time);
}

export type MessageReader = {
  id: string;
  name: string;
  avatarSrc?: string;
  /** ISO-момент, до якого людина дочитала чат (RoomReadState.lastReadAt). */
  readAt: string;
};

export type ReaderReaction = {
  userId: string;
  name: string;
  avatarSrc?: string;
  emoji: string;
};

/** Хто прочитав: лише ті, чий read-state покриває повідомлення; від найранішого прочитання до найпізнішого. */
export function sortReadersByTime<T extends { readAt: string }>(readers: readonly T[]): T[] {
  return [...readers].sort(
    (a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime(),
  );
}
