import type { Metadata, Viewport } from "next";
import SiteFooter from "@/components/Site/SiteFooter";
import SiteHeader from "@/components/Site/SiteHeader";
import { getTranslations } from "next-intl/server";
import { ebGaramond } from "@/styles/fonts";
import { globalSeo } from "@/seo/global.seo";
import { siteOrigin } from "@/lib/siteOrigin";
import styles from "./site.module.scss";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  applicationName: "Christ App",
  manifest: globalSeo.manifest,
  icons: globalSeo.icons,
  // Публічні сторінки мають бути індексованими без обмежень.
  robots: { index: true, follow: true },
};

/** Без `maximumScale`/`userScalable: false` (як в оболонці застосунку): на лендингу масштабування дозволене. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#f6f7f2",
};

/**
 * Публічна оболонка: лендинг, Privacy Policy, Terms. Не підключає `Providers`, `AuthSessionSync`,
 * сокети, навбар і сплеш — сторінки відповідають HTTP 200 і рендерять увесь вміст на сервері
 * без сесії та клієнтського JS.
 */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "site.nav" });

  return (
    <div
      id="site-root"
      data-allow-select
      lang={lang === "ua" ? "uk" : lang}
      className={`${styles.root} ${ebGaramond.variable}`}
    >
      <a href="#site-main" className={styles.skip}>
        {t("skip")}
      </a>
      <SiteHeader lang={lang} />
      <main id="site-main" className={styles.main}>
        {children}
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
