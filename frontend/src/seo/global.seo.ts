import type { Metadata } from "next";
import { appleStartupImages } from "./appleSplash";

export const globalSeo: Metadata = {
  title: "Bible Chat MVP",
  description: "MVP Bible reader and chat with Jesus",
  applicationName: "Christ App",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    /**
     * "black-translucent" ламало всю розкладку: вебвʼю тоді малюється під статус-баром
     * на весь екран (viewport «виростає» на висоту статус-бара), а вся верстка застосунку
     * розрахована на старий, не-оверлейний режим (`.main`, TabBar, шапки екранів — без
     * жодного запасу під статус-бар). "black" лишає темний колір статус-бара, але
     * контент, як і раніше, починається під ним — safe-area-inset-top знову 0.
     */
    statusBarStyle: "black",
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
