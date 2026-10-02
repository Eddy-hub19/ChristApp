// pdf.js потребує cmaps (CJK) і standard_fonts (не вбудовані шрифти) як окремі файли — кладемо в public/pdfjs.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(process.cwd(), "public", "pdfjs");

mkdirSync(target, { recursive: true });
for (const dir of ["cmaps", "standard_fonts"]) {
  const from = path.join(pkgDir, dir);
  if (existsSync(from)) cpSync(from, path.join(target, dir), { recursive: true });
}
