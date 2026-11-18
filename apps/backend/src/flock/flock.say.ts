import { FLOCK_CONFIG } from './flock.config';
import profanity from './flock.profanity.json';

/**
 * Свій текст у швидких фразах «Отари»: очищення й фільтр. Вхід - довільний рядок від клієнта, вихід - безпечний текст
 * або причина відмови. Нічого не пишеться в БД.
 */
export type SayReject = 'type' | 'empty' | 'profanity';
export type SayResult = { ok: true; text: string } | { ok: false; reason: SayReject };

// керівні символи, невидимі форматувальні (нульової ширини, bidi) і заміна
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;
const URL_RE =
  /(?:https?:\/\/|ftp:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|ua|ru|su|me|gg|ly|co|info|biz|xyz|app|dev|tv|by|pl|de|uk|eu|fm|cc|to|tk|online|site|click|top|link|shop)\b(?:\/\S*)?/gi;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const TG_RE = /(?:^|\s)@\w{3,}/g;
// номери телефонів: 7+ цифр з допустимими розділювачами
const PHONE_RE = /(?:\+?\d[\s\-().]*){7,}/g;

/** Схожі літери й цифри -> кирилиця (для обходу фільтра підміною). */
const LOOKALIKE: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', i: 'и',
  '0': 'о', '3': 'з', '4': 'ч', '6': 'б', '1': 'и', '@': 'а', $: 'с', '!': 'и',
  ё: 'е', і: 'и', ї: 'и', є: 'е', ґ: 'г', ъ: '', ь: '',
};

/** Нормалізація слова для порівняння з коренями (кирилична форма, без повторів букв). */
function normalizeCyr(s: string, squash = true): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += LOOKALIKE[ch] ?? ch;
  return squash ? out.replace(/(.)\1+/gu, '$1') : out;
}

/** Англійська нормалізація: цифри/символи -> літери, повтори стискаються. */
function normalizeLat(s: string, squash = true): string {
  const map: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };
  let out = '';
  for (const ch of s.toLowerCase()) out += map[ch] ?? ch;
  return squash ? out.replace(/(.)\1+/gu, '$1') : out;
}

interface Lists {
  stems: Set<string>;
  words: Set<string>;
  stemsLat: Set<string>;
  wordsLat: Set<string>;
}
let lists: Lists | null = null;
function loadLists(): Lists {
  if (lists) return lists;
  const p = profanity as { stems: Record<string, string[]>; words: Record<string, string[]> };
  const stems = new Set<string>();
  const words = new Set<string>();
  const stemsLat = new Set<string>();
  const wordsLat = new Set<string>();
  for (const [lang, arr] of Object.entries(p.stems ?? {})) for (const w of arr) (lang === 'en' ? stemsLat : stems).add(lang === 'en' ? normalizeLat(w) : normalizeCyr(w));
  // слова: точна форма (без стискання повторів, тож 'as' != 'ass') і стиснута, якщо в ній 3+ літер ('сукаааа')
  for (const [lang, arr] of Object.entries(p.words ?? {})) {
    for (const w of arr) {
      const set = lang === 'en' ? wordsLat : words;
      const norm = lang === 'en' ? normalizeLat : normalizeCyr;
      set.add(norm(w, false));
      const sq = norm(w);
      if (sq.length >= 3) set.add(`~${sq}`);
    }
  }
  lists = { stems, words, stemsLat, wordsLat };
  return lists;
}

/** Чи містить текст заборонене слово (ua/ru/en, регістр і підміна букв враховані). */
export function hasProfanity(text: string): boolean {
  const L = loadLists();
  const lower = text.toLowerCase();
  // слова: літери/цифри з підміною (@, $, !, |) всередині; по краях такі символи - пунктуація
  const tokens = lower
    .split(/[^\p{L}\p{N}@$!|]+/u)
    .map((t) => t.replace(/^[@$!|]+|[@$!|]+$/g, ''))
    .filter(Boolean);
  // розбиття по літерах ('х у й', 'f.u.c.k'): суміжні односимвольні токени склеюємо в одне слово
  const all = [...tokens];
  let run = '';
  for (const t of [...tokens, '']) {
    if ([...t].length === 1) run += t;
    else {
      if ([...run].length >= 3) all.push(run);
      run = '';
    }
  }
  for (const raw of all) {
    const c = normalizeCyr(raw);
    const l = normalizeLat(raw);
    const cx = normalizeCyr(raw, false);
    const lx = normalizeLat(raw, false);
    if (L.words.has(cx) || L.wordsLat.has(lx)) return true;
    if ((c.length >= 3 && L.words.has(`~${c}`)) || (l.length >= 3 && L.wordsLat.has(`~${l}`))) return true;
    for (const s of L.stems) if (c.includes(s)) return true;
    for (const s of L.stemsLat) if (l.includes(s)) return true;
  }
  return false;
}

/** Очищення: пробіли, керівні символи, посилання, e-mail, телефони; довжина обмежується конфігом. */
export function cleanText(raw: string): string {
  let t = raw.normalize('NFKC').replace(CONTROL, ' ');
  t = t.replace(EMAIL_RE, ' ').replace(URL_RE, ' ').replace(TG_RE, ' ').replace(PHONE_RE, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return [...t].slice(0, FLOCK_CONFIG.phrases.customMaxLen).join('').trim();
}

export function sanitizeSay(raw: unknown): SayResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'type' };
  // не обробляємо величезні рядки: з усього береться голова з запасом на видалені фрагменти
  const text = cleanText(raw.slice(0, FLOCK_CONFIG.phrases.customMaxLen * 8));
  if (!text) return { ok: false, reason: 'empty' };
  if (hasProfanity(text)) return { ok: false, reason: 'profanity' };
  return { ok: true, text };
}
