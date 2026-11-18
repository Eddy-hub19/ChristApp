#!/usr/bin/env node
/**
 * Генерує public/og/flock.png (1200x630) - превʼю посилання-запрошення в «Отару» (Open Graph / Twitter).
 * Уся графіка власна: пасовище, пучки трави, квіти, овечки й вовк, намальовані SVG-примітивами.
 *
 * Запуск: node scripts/generate-flock-og.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "og", "flock.png");
const W = 1200;
const H = 630;

const tuft = (x, y, s = 1) =>
  `<g stroke="#4a9a47" stroke-width="${5 * s}" stroke-linecap="round" fill="none" opacity="0.8">
    <path d="M${x} ${y} q${-6 * s} ${-18 * s} ${-14 * s} ${-30 * s}"/><path d="M${x} ${y} q${1 * s} ${-22 * s} ${2 * s} ${-36 * s}"/><path d="M${x} ${y} q${8 * s} ${-16 * s} ${16 * s} ${-28 * s}"/></g>`;

const flower = (x, y, c = "#ff8fb8") =>
  `<g>${[0, 72, 144, 216, 288].map((a) => `<circle cx="${x + Math.cos((a * Math.PI) / 180) * 9}" cy="${y + Math.sin((a * Math.PI) / 180) * 9}" r="7.5" fill="${c}"/>`).join("")}<circle cx="${x}" cy="${y}" r="6" fill="#ffd94a"/></g>`;

function sheep(cx, cy, r, fur = "#f6f1e7", face = "#3b3532", rot = 0) {
  const bumps = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 + 0.2;
    return `<circle cx="${Math.cos(a) * r * 0.74}" cy="${Math.sin(a) * r * 0.74}" r="${r * 0.27}" fill="${fur}"/>`;
  }).join("");
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
    <circle cx="${r * 0.06}" cy="${r * 0.1}" r="${r * 0.98}" fill="rgba(0,0,0,0.18)"/>
    ${bumps}<circle r="${r * 0.82}" fill="${fur}"/>
    <circle cx="${-r * 0.2}" cy="${-r * 0.25}" r="${r * 0.5}" fill="#fff" opacity="0.6"/>
    <ellipse cx="${r * 0.36}" cy="0" rx="${r * 0.46}" ry="${r * 0.4}" fill="${face}"/>
    <ellipse cx="${-r * 0.02}" cy="${-r * 0.72}" rx="${r * 0.22}" ry="${r * 0.12}" fill="${face}"/><ellipse cx="${-r * 0.02}" cy="${r * 0.72}" rx="${r * 0.22}" ry="${r * 0.12}" fill="${face}"/>
    <circle cx="${r * 0.22}" cy="${-r * 0.18}" r="${r * 0.13}" fill="#fff"/><circle cx="${r * 0.22}" cy="${r * 0.18}" r="${r * 0.13}" fill="#fff"/>
    <circle cx="${r * 0.25}" cy="${-r * 0.18}" r="${r * 0.07}" fill="#16130f"/><circle cx="${r * 0.25}" cy="${r * 0.18}" r="${r * 0.07}" fill="#16130f"/>
    <circle cx="${r * 0.62}" cy="0" r="${r * 0.08}" fill="#f2a7b3"/></g>`;
}

function wolf(cx, cy, r, fur = "#8c929c", rot = 0) {
  const ear = (side) => {
    const a = side * 1.05;
    const ex = Math.cos(a) * r * 0.72;
    const ey = Math.sin(a) * r * 0.72;
    return `<polygon points="${ex + Math.cos(a + side * 0.9) * r * 0.32},${ey + Math.sin(a + side * 0.9) * r * 0.32} ${ex + Math.cos(a - side * 0.9) * r * 0.32},${ey + Math.sin(a - side * 0.9) * r * 0.32} ${Math.cos(a) * r * 1.14},${Math.sin(a) * r * 1.14}" fill="${fur}"/>`;
  };
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
    <circle cx="${r * 0.06}" cy="${r * 0.1}" r="${r}" fill="rgba(0,0,0,0.18)"/>
    ${ear(-1)}${ear(1)}<circle r="${r}" fill="${fur}"/><circle cx="${-r * 0.22}" cy="${-r * 0.28}" r="${r * 0.5}" fill="#b4bac4" opacity="0.4"/>
    <ellipse cx="${r * 0.45}" cy="0" rx="${r * 0.42}" ry="${r * 0.34}" fill="#d3d6db"/>
    <circle cx="${r * 0.2}" cy="${-r * 0.2}" r="${r * 0.11}" fill="#f3d65c"/><circle cx="${r * 0.2}" cy="${r * 0.2}" r="${r * 0.11}" fill="#f3d65c"/>
    <circle cx="${r * 0.23}" cy="${-r * 0.2}" r="${r * 0.05}" fill="#16130f"/><circle cx="${r * 0.23}" cy="${r * 0.2}" r="${r * 0.05}" fill="#16130f"/>
    <circle cx="${r * 0.78}" cy="0" r="${r * 0.09}" fill="#1a1717"/></g>`;
}

const bush = (x, y, r) => {
  const spikes = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.82;
    return `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`;
  }).join(" ");
  return `<polygon points="${spikes}" fill="#2f7a3a"/><circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="#47a357"/><circle cx="${x - r * 0.2}" cy="${y - r * 0.22}" r="${r * 0.38}" fill="#5fbf6e"/>
  <circle cx="${x + r * 0.25}" cy="${y + r * 0.2}" r="${r * 0.07}" fill="#e9577f"/><circle cx="${x - r * 0.3}" cy="${y + r * 0.3}" r="${r * 0.07}" fill="#e9577f"/>`;
};

const grid = Array.from({ length: 14 }, (_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="${H}"/>`).join("") +
  Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="${W}" y2="${i * 90}"/>`).join("");

const tufts = [[80, 560], [210, 470], [330, 590], [520, 520], [640, 600], [760, 480], [900, 590], [1010, 500], [1120, 585], [140, 330], [980, 120], [60, 130], [1130, 330]]
  .map(([x, y], i) => tuft(x, y, 1 + (i % 3) * 0.25)).join("");
const flowers = [[260, 540, "#ff8fb8"], [590, 440, "#ffd94a"], [850, 560, "#ff8fb8"], [1060, 430, "#fff"], [420, 330, "#ff8fb8"], [110, 450, "#ffd94a"]]
  .map(([x, y, c]) => flower(x, y, c)).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#d6f0b4"/><stop offset="100%" stop-color="#9ccf7c"/></radialGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14301c" stop-opacity="0.78"/><stop offset="0.62" stop-color="#14301c" stop-opacity="0.35"/><stop offset="1" stop-color="#14301c" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g stroke="rgba(70,125,50,0.25)" stroke-width="2">${grid}</g>
  ${tufts}${flowers}
  ${bush(1040, 190, 62)}
  ${sheep(760, 360, 118, "#f6f1e7", "#3b3532", -8)}
  ${sheep(930, 470, 74, "#f7c6d3", "#4a3440", 14)}
  ${sheep(600, 500, 58, "#bcd8f5", "#33404f", -20)}
  ${wolf(1060, 430, 66, "#8c929c", 190)}
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <text x="70" y="290" font-family="Helvetica Neue, Arial, sans-serif" font-size="148" font-weight="800" fill="#ffffff" stroke="#173d22" stroke-width="10" paint-order="stroke" stroke-linejoin="round">Отара</text>
  <text x="76" y="372" font-family="Helvetica Neue, Arial, sans-serif" font-size="52" font-weight="700" fill="#ffe9a8" stroke="#173d22" stroke-width="6" paint-order="stroke" stroke-linejoin="round">Flock · ChristApp</text>
  <text x="76" y="452" font-family="Helvetica Neue, Arial, sans-serif" font-size="36" font-weight="600" fill="#ffffff" stroke="#173d22" stroke-width="5" paint-order="stroke" stroke-linejoin="round">Їж траву, рости, не дай себе з'їсти</text>
</svg>`;

await mkdir(path.dirname(OUT), { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);
console.log("written", OUT);
