"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pageTemplate } from "@/lib/analytics";
import {
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analyticsConsent";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./ConsentBanner.module.scss";

/** Экраны, где баннер не показываем, чтобы не перекрыть поле ввода, игру или служебный экран. */
function isBannerHidden(template: string): boolean {
  return (
    template === "/chat/[id]" ||
    template.startsWith("/games/") ||
    template.startsWith("/cinema/") ||
    template === "/choose-nickname" ||
    template.startsWith("/admin")
  );
}

/** Публичные страницы без навбара (лендинг, Privacy, Terms) и экраны входа. */
function hasNoTabBar(template: string): boolean {
  return (
    template === "/welcome" ||
    template === "/privacy" ||
    template === "/terms" ||
    template === "/login" ||
    template === "/register"
  );
}

/**
 * Компактный баннер согласия на аналитику (Consent Mode v2). Показывается один раз, пока нет выбора;
 * выбор хранится в localStorage и меняется в «Профіль → Налаштування → Аналітика». Не блокирует интерфейс.
 */
export default function ConsentBanner({
  pathname,
  consent,
}: {
  pathname: string;
  consent: AnalyticsConsent | null;
}) {
  const t = useTranslations("analytics");
  const hydrated = useHydrated();
  const [tabBarVisible, setTabBarVisible] = useState(false);
  const template = pageTemplate(pathname);
  const visible = hydrated && consent === null && !isBannerHidden(template);

  // Над навбаром: он есть не на всех экранах, поэтому смотрим на реальный DOM, а пока баннер открыт — перепроверяем.
  useEffect(() => {
    if (!visible) return;
    const sync = () => setTabBarVisible(Boolean(document.querySelector("[data-tab]")));
    sync();
    const id = window.setInterval(sync, 1000);
    return () => window.clearInterval(id);
  }, [visible, pathname]);

  if (!visible) return null;

  const aboveTabBar = tabBarVisible && !hasNoTabBar(template);

  return (
    <div
      className={`${styles.banner} ${aboveTabBar ? styles.aboveTabBar : ""}`}
      role="region"
      aria-label={t("bannerRegion")}
      data-analytics-consent
    >
      <p className={styles.text}>
        {t("bannerText")}{" "}
        <Link href="/privacy" className={styles.link}>
          {t("privacy")}
        </Link>
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => writeAnalyticsConsent("denied")}
        >
          {t("decline")}
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => writeAnalyticsConsent("granted")}
        >
          {t("accept")}
        </button>
      </div>
    </div>
  );
}
