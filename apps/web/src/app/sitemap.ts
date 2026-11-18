import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { PUBLIC_PATHS, siteOrigin } from "@/lib/siteOrigin";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return routing.langs.flatMap((lang) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${origin}/${lang}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "/welcome" ? 1 : 0.5,
    })),
  );
}
