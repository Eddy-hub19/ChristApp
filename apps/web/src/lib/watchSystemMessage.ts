import { watchUserName } from "@/lib/queries/watchRoomsQueries";

export type WatchSystemEvent = "left" | "joined" | "back";

/** Дані службового рядка чату зали (вихід/вхід учасника); текст збирається тут, на клієнті, з перекладів. */
export type WatchSystemData = {
  event: WatchSystemEvent;
  /** ISO-час події; для "back" — час повернення. */
  at: string;
  wasHost?: boolean;
  /** Керування перейшло до цього користувача. */
  toUserId?: string;
  /** Хост пішов, передати було нікому — показ на паузі. */
  paused?: boolean;
};

type Translate = (key: string, values?: Record<string, string>) => string;

type SystemMessageLike = {
  createdAt: string;
  type?: "TEXT" | "SYSTEM";
  systemData?: WatchSystemData | null;
  user: { nickname: string | null; username: string };
};

type MemberLike = { id: string; nickname: string | null; username: string };

export function isSystemMessage(message: { type?: "TEXT" | "SYSTEM" }): boolean {
  return message.type === "SYSTEM";
}

/** Час події для рядка: момент повернення для "back", інакше час створення. */
export function systemMessageTime(message: SystemMessageLike): string {
  return message.systemData?.at ?? message.createdAt;
}

/** Текст без часу. Ключі — у просторі імен `cinema.hall`. Невідомі події дають порожній рядок. */
export function systemMessageText(t: Translate, message: SystemMessageLike, members: MemberLike[]): string {
  const data = message.systemData;
  if (!data) return "";
  const name = watchUserName(message.user);
  if (data.event === "joined") return t("systemJoined", { name });
  if (data.event === "back") return t("systemBack", { name });
  if (data.event !== "left") return "";
  if (!data.wasHost) return t("systemLeft", { name });
  const toUser = data.toUserId ? members.find((m) => m.id === data.toUserId) : undefined;
  if (toUser) return t("systemHostLeftHandover", { name, toName: watchUserName(toUser) });
  if (data.paused) return t("systemHostLeftPaused", { name });
  return t("systemHostLeft", { name });
}
