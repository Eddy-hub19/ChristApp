import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/siteOrigin";

/** Публічні сторінки відкриті для всіх краулерів, зокрема Googlebot; закрито лише технічні API-маршрути. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
