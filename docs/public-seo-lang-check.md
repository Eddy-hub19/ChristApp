# SEO публичных страниц: `<html lang>` и hreflang

## Что изменено

1. **`<html lang>` по локали.** Разметка `<html>` вынесена из `app/layout.tsx` в общий компонент `app/RootHtml.tsx` с пропом `lang`. `app/[lang]/layout.tsx` теперь корневой layout и подставляет `en` / `ru` / `uk` (для URL `/ua` код `uk`). Редирект с `/` вынесен в группу `app/(root)` с собственным layout (`ru`). Клиентский `HtmlLang` больше не пишет невалидный `ua` в `<html>`.
2. **HTTP-заголовок `Link` и hreflang.** Автогенерация `Link` в next-intl отключена (`alternateLinks: false`): она отдавала `hreflang="ua"` и `x-default` на `/welcome`. Заголовок для `/{lang}/welcome|privacy|terms` теперь формирует `middleware.ts` из тех же данных, что и теги в HTML (`publicAlternates` в `lib/siteOrigin.ts`): `en`, `ru`, `uk`, `x-default` → `/en/<страница>`.

## Проверка (`next build` + `next start`, `curl` без JS, `NEXT_PUBLIC_SITE_URL=https://christapp.ddns.net`)

| URL | Статус | `<html lang>` | `Link` (hreflang) | `<link rel=alternate>` в HTML |
| --- | --- | --- | --- | --- |
| `/en/welcome` | 200 | `en` | en, ru, uk, x-default → `/en/welcome` | то же |
| `/ru/welcome` | 200 | `ru` | то же | то же |
| `/ua/welcome` | 200 | `uk` | то же | то же |
| `/en/privacy`, `/ru/privacy` | 200 | `en`, `ru` | en, ru, uk, x-default → `/en/privacy` | — |
| `/ua/terms` | 200 | `uk` | x-default → `/en/terms` | — |
| `/en`, `/ua`, `/ru/chat` (оболочка приложения) | 200 | `en`, `uk`, `ru` | нет (не публичная страница) | — |
| `/welcome`, `/` | 307 → `/ru/welcome`, `/ru` | — | — | — |

`tsc --noEmit` без ошибок, `next build` (Turbopack, как в Dockerfile) успешен, публичные страницы остались статическими (SSG). `/manifest.webmanifest` и `/sw.js` отвечают 200.

## Замечания

- Корневой `middleware.ts` подхватывает Turbopack (как в проде), webpack-сборка его игнорирует из-за каталога `src`: проверять нужно сборкой `next build` без `--webpack`.
- Страницы кешируются на год (`s-maxage`): после выката нужно сбросить кеш прокси/CDN, иначе Googlebot увидит старые `lang` и `Link`.
- ESLint и тесты не запускались (по условию).
