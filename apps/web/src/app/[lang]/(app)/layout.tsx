import type { Metadata, Viewport } from "next";
import DesignBackdrop from "@/components/DesignBackdrop/DesignBackdrop";
import AppBackground from "@/components/ChatBackground/ChatBackground";
import AdaptiveMain from "@/components/AdaptiveMain/AdaptiveMain";
import CinemaProvider from "@/components/Cinema/CinemaProvider";
import AppWhatsNew from "@/components/AppWhatsNew/AppWhatsNew";
import OtaraAnnouncement from "@/components/OtaraAnnouncement/OtaraAnnouncement";
import AuthSessionSync from "@/components/AuthSessionSync/AuthSessionSync";
import PresenceSocket from "@/components/PresenceSocket/PresenceSocket";
import PwaInstallPrompt from "@/components/PwaInstallPrompt/PwaInstallPrompt";
import PwaRegistration from "@/components/PwaRegistration/PwaRegistration";
import PushAutoSync from "@/components/PushAutoSync/PushAutoSync";
import SplashScreen from "@/components/SplashScreen/SplashScreen";
import TabBar from "@/components/TabBar/TabBar";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
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

/**
 * Оболонка застосунку (авторизація, сокети, навбар, сплеш). Публічні сторінки
 * (лендинг, Privacy Policy, Terms) живуть у групі `(site)` і цю оболонку не підключають —
 * тому не залежать від сесії, localStorage і клієнтського JS.
 */
export default function AppShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SplashScreen />
      <Providers>
        <AuthSessionSync />
        <PwaRegistration />
        <PwaInstallPrompt />
        <PushAutoSync />
        <AppWhatsNew />
        <PresenceSocket>
          <CinemaProvider>
            <OtaraAnnouncement />
            <DesignBackdrop />
            <AppBackground />
            <ThemeToggle />
            <AdaptiveMain>{children}</AdaptiveMain>
            <TabBar />
          </CinemaProvider>
        </PresenceSocket>
      </Providers>
    </>
  );
}
