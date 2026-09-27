import type { Metadata } from "next";
import { appleStartupImages } from "./appleSplash";

export const globalSeo: Metadata = {
  title: "Bible Chat MVP",
  description: "MVP Bible reader and chat with Jesus",
  applicationName: "Christ App",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    /** Тёмна тема застосунку — статус-бар зливається з екраном завантаження/чатами, а не білою плашкою. */
    statusBarStyle: "black-translucent",
    title: "Christ App",
    startupImage: appleStartupImages,
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};
