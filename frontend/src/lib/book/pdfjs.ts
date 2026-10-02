import type * as PdfJs from "pdfjs-dist/legacy/build/pdf.mjs";

export type PdfJsModule = typeof PdfJs;

let cached: Promise<PdfJsModule> | null = null;

/** pdf.js тягнемо динамічно (лише в браузері, лише коли відкрили книгу); legacy-збірка — для старих iOS. */
export function loadPdfJs(): Promise<PdfJsModule> {
  cached ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return mod;
  });
  return cached;
}
