import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import FlockRoute from "./FlockRoute";

type PageProps = { params: Promise<{ lang: string }> };

function siteOrigin() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/**
 * Превʼю посилання-запрошення в месенджерах (Open Graph / Twitter): назва, опис, картинка «Отари».
 * Сторінка публічна (авторизація - на клієнті), тож краулер бачить ці теги без входу.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "flock.og" });
  const title = t("title");
  const description = t("description");
  const image = { url: "/og/flock.png", width: 1200, height: 630, alt: t("imageAlt") };
  return {
    metadataBase: new URL(siteOrigin()),
    title,
    description,
    openGraph: { type: "website", siteName: "ChristApp", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function FlockPage() {
  return <FlockRoute />;
}
