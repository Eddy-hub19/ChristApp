import "@/i18n/uaPluralAlias";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import AppBackground from "@/components/ChatBackground/ChatBackground";
import AdaptiveMain from "@/components/AdaptiveMain/AdaptiveMain";
import CinemaProvider from "@/components/Cinema/CinemaProvider";
import AppWhatsNew from "@/components/AppWhatsNew/AppWhatsNew";
import AuthSessionSync from "@/components/AuthSessionSync/AuthSessionSync";
import HtmlLang from "@/components/HtmlLang/HtmlLang";
import PresenceSocket from "@/components/PresenceSocket/PresenceSocket";
import PwaInstallPrompt from "@/components/PwaInstallPrompt/PwaInstallPrompt";
import PwaRegistration from "@/components/PwaRegistration/PwaRegistration";
import PushAutoSync from "@/components/PushAutoSync/PushAutoSync";
import SplashScreen from "@/components/SplashScreen/SplashScreen";
import TabBar from "@/components/TabBar/TabBar";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import { routing } from "@/i18n/routing";
import Providers from "@/providers/providers";
import { globalSeo } from "@/seo/global.seo";

export const metadata: Metadata = globalSeo;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Android: клавіатура стискає контент, а не накриває його.
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f0" },
    { media: "(prefers-color-scheme: dark)", color: "#17151a" },
  ],
};

export function generateStaticParams() {
  return routing.langs.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  if (!routing.langs.includes(lang as (typeof routing.langs)[number])) {
    notFound();
  }

  setRequestLocale(lang);
  const messages = await getMessages({ locale: lang });

  return (
    <NextIntlClientProvider locale={lang} messages={messages}>
      <HtmlLang />
      <SplashScreen />
      <Providers>
        <AuthSessionSync />
        <PwaRegistration />
        <PwaInstallPrompt />
        <PushAutoSync />
        <AppWhatsNew />
        <PresenceSocket>
          <CinemaProvider>
            <AppBackground />
            <ThemeToggle />
            <AdaptiveMain>{children}</AdaptiveMain>
            <TabBar />
          </CinemaProvider>
        </PresenceSocket>
      </Providers>
    </NextIntlClientProvider>
  );
}
