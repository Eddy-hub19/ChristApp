import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Landing from "@/components/Landing/Landing";
import { publicAlternates, siteOrigin } from "@/lib/siteOrigin";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "site.meta" });
  const title = t("homeTitle");
  const description = t("homeDescription");
  return {
    title: { absolute: title },
    description,
    alternates: publicAlternates(lang, "/welcome"),
    openGraph: {
      type: "website",
      siteName: "Christ App",
      title,
      description,
      url: `/${lang}/welcome`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function WelcomePage({ params }: PageProps) {
  const { lang } = await params;
  setRequestLocale(lang);

  const origin = siteOrigin();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Christ App",
        url: `${origin}/${lang}/welcome`,
        inLanguage: lang === "ua" ? "uk" : lang,
      },
      {
        "@type": "Organization",
        name: "Christ App",
        url: `${origin}/${lang}/welcome`,
        logo: `${origin}/icon-512x512.png`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Landing lang={lang} />
    </>
  );
}
