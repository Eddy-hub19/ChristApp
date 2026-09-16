"use client";

import { useEffect, useRef } from "react";
import type { TelegramAuthUser } from "@/lib/authSession";
import styles from "./TelegramLoginButton.module.scss";

const TELEGRAM_BOT_USERNAME = "chirst_app_login_bot";
const TELEGRAM_WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";
const TELEGRAM_CALLBACK_NAME = "__christAppOnTelegramAuth";

type TelegramWindow = Window &
  Record<string, ((user: TelegramAuthUser) => void) | undefined>;

export type TelegramLoginButtonProps = {
  onAuth: (user: TelegramAuthUser) => void;
};

/**
 * Вставляет Telegram Login Widget (https://core.telegram.org/widgets/login).
 * Виджет сам рендерит кнопку внутри своего <script>-тега и вызывает
 * глобальный колбэк по имени, поэтому мы регистрируем его на window
 * и подчищаем при размонтировании.
 */
export default function TelegramLoginButton({
  onAuth,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const win = window as unknown as TelegramWindow;
    win[TELEGRAM_CALLBACK_NAME] = (user: TelegramAuthUser) =>
      onAuthRef.current(user);

    const script = document.createElement("script");
    script.async = true;
    script.src = TELEGRAM_WIDGET_SRC;
    script.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", `${TELEGRAM_CALLBACK_NAME}(user)`);
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      container.replaceChildren();
      delete win[TELEGRAM_CALLBACK_NAME];
    };
  }, []);

  return <div ref={containerRef} className={styles.widget} />;
}
