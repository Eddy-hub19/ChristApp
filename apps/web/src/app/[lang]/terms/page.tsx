import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/LegalPage/LegalPage";
import { termsOfService } from "@/content/legal";

export const metadata: Metadata = { title: termsOfService.title };

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  setRequestLocale(lang);
  return <LegalPage doc={termsOfService} backLabel="Back" />;
}
