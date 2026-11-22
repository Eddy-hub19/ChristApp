import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";
import RootHtml from "../RootHtml";

/** Корінь `/` лише редіректить на мову за замовчуванням, але сторінці потрібен власний `<html>`. */
export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return <RootHtml lang={routing.defaultLang}>{children}</RootHtml>;
}
