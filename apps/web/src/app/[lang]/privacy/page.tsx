import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/LegalPage/LegalPage";
import { privacyPolicy } from "@/content/legal";

export const metadata: Metadata = { title: privacyPolicy.title };

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  setRequestLocale(lang);
  return <LegalPage doc={privacyPolicy} backLabel="Back" />;
}
