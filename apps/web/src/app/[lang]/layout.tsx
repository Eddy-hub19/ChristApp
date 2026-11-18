import "@/i18n/uaPluralAlias";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import HtmlLang from "@/components/HtmlLang/HtmlLang";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.langs.map((lang) => ({ lang }));
}

/**
 * Спільний layout локалі: валідація мови та next-intl. Оболонка застосунку — у `(app)/layout.tsx`,
 * публічні сторінки — у `(site)/layout.tsx`.
 */
export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  if (!routing.langs.includes(lang as (typeof routing.langs)[number])) {
    notFound();
  }

  setRequestLocale(lang);
  const messages = await getMessages({ locale: lang });

  return (
    <NextIntlClientProvider locale={lang} messages={messages}>
      <HtmlLang />
      {children}
    </NextIntlClientProvider>
  );
}
