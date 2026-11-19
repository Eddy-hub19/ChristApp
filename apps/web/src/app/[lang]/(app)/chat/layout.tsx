"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useChatSplit } from "@/hooks/useChatSplit";
import ChatListScreen from "./ChatListScreen";
import styles from "./chatSplit.module.scss";

/**
 * Раскладка раздела «Чат». Телефон: как раньше - список на /chat, комната на /chat/<id>.
 * ПК в новом дизайне (как в Telegram): слева список переписок, справа открытая комната или заглушка.
 * Список монтируется один раз и не перерисовывается при переходах между комнатами.
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const split = useChatSplit();
  const inRoom = pathname.startsWith("/chat/");
  const showList = split || !inRoom;
  const showMain = split || inRoom;

  // Атрибут на <html>: сайт расширяет колонку `main` и сдвигает навбар под список (styles/designV2.scss).
  useEffect(() => {
    if (!split) return;
    const root = document.documentElement;
    root.setAttribute("data-chat-split", "");
    return () => root.removeAttribute("data-chat-split");
  }, [split]);

  return (
    <div className={split ? styles.split : styles.single}>
      {showList ? (
        <aside className={split ? styles.listPane : styles.fullPane}>
          <ChatListScreen />
        </aside>
      ) : null}
      {showMain ? (
        <div className={split ? styles.roomPane : styles.fullPane}>
          {inRoom ? (
            children
          ) : split ? (
            <div className={styles.empty}>
              <span className={styles.emptyBadge}>{t("splitEmpty")}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
