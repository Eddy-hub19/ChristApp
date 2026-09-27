import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Christ App",
    short_name: "ChristApp",
    description: "Read Scripture, chat, and stay connected.",
    /**
     * Головний екран із префіксом локалі (без редиректу з `/`, щоб на старті PWA
     * не губились куки в Safari). Звідти екран запуску сам переведе в чати,
     * щойно бекенд прокинеться й відновиться сесія.
     */
    start_url: "/en",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en",
    /** Той самий темний фон, що й екран завантаження (`SplashScreen`/`ServerStartupScreen`) — без спалаху іншого кольору між системною заставкою й першим пейнтом. */
    background_color: "#2e2d2d",
    theme_color: "#2e2d2d",
    categories: ["books", "education", "lifestyle"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
