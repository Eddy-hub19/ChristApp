import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/LegalPage/LegalPage";
import { privacyPolicy } from "@/content/legal";
import { publicAlternates } from "@/lib/siteOrigin";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const title = `${privacyPolicy.title} — Christ App`;
  return {
    title: { absolute: title },
    description: privacyPolicy.description,
    alternates: publicAlternates(lang, "/privacy"),
    openGraph: {
      type: "article",
      siteName: "Christ App",
      title,
      description: privacyPolicy.description,
      url: `/${lang}/privacy`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { lang } = await params;
  setRequestLocale(lang);
  return <LegalPage doc={privacyPolicy} lang={lang} />;
}
