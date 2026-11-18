import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/LegalPage/LegalPage";
import { termsOfService } from "@/content/legal";
import { publicAlternates } from "@/lib/siteOrigin";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const title = `${termsOfService.title} — Christ App`;
  return {
    title: { absolute: title },
    description: termsOfService.description,
    alternates: publicAlternates(lang, "/terms"),
    openGraph: {
      type: "article",
      siteName: "Christ App",
      title,
      description: termsOfService.description,
      url: `/${lang}/terms`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { lang } = await params;
  setRequestLocale(lang);
  return <LegalPage doc={termsOfService} lang={lang} />;
}
