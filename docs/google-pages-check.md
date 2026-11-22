# Проверка публичных страниц для Google-верификации

Дата проверки: 2026-11-22. Хост: `https://christapp.ddns.net` (боевой деплой). Изменений в коде не вносилось, только отчёт.
Проверялось `curl`-ом без cookie и авторизации, в том числе с User-Agent `Googlebot/2.1`.

## Итог

Все обязательные требования выполнены: страницы публичные, отвечают 200, содержат название, назначение, вход через Google, ссылки на Privacy/Terms и контакт. Английский лендинг уже есть (`/en/welcome`), добавлять его не нужно. Найдены три некритичных замечания (язык в `<html>`, невалидный `hreflang="ua"` в HTTP-заголовке, кеш `s-maxage` на год) и одно организационное: корень `/` и `/en` не подходят как «домашняя страница» в OAuth-экране.

## Таблица проверок

| Проверка | Результат | Что исправить |
| --- | --- | --- |
| HTTP-статус `/ru/welcome`, `/en/welcome`, `/ua/welcome` | 200, без редиректа и без входа (обычный клиент и Googlebot) | Ничего |
| HTTP-статус `/en/privacy`, `/en/terms`, `/ru/privacy` | 200, без редиректа и без входа | Ничего |
| Контактная информация | Отдельной страницы Contact нет. Контакт есть на лендинге (блок «Contact» с email владельца и `mailto:`), в футере, в Privacy и Terms | Ничего. Отдельная `/contact` не требуется: контакт есть на самих страницах |
| Название «Christ App» | Есть на всех проверенных страницах (title, шапка, текст, футер) | Ничего |
| Описание назначения | `/en/welcome`: «A Christian community platform…» (title «Christ App — United in Christ»); `/ru/welcome`: христианская платформа для общения верующих: чат, чтение Библии, заметки, игры, профили | Ничего |
| Упоминание входа через Google | Лендинг: кнопка «Sign In» с подписью «Sign in with your Google account» и отдельный блок «Sign in with Google» с перечнем получаемых данных (ID, email, имя, фото; пароль Google не получается). Privacy: раздел «Information we collect» про Google Sign-In, есть «Limited Use» | Ничего |
| Видимые ссылки на Privacy и Terms | На лендинге в шапке и в футере (`/en/privacy`, `/en/terms`, по языку страницы); на Privacy и Terms тоже | Ничего |
| Ссылка на контакт | `mailto:` на лендинге, в Privacy и Terms | Ничего |
| Язык страниц | Содержимое соответствует URL (en/ru/ua). Но `<html lang="ru">` на **всех** страницах, включая `/en/*` (корневой layout ставит `ru` статически; в публичной оболочке язык задаёт только внутренний `<div lang>`). В Privacy/Terms для ru/ua текст по-английски, так задумано, есть пометка | Низкий приоритет: отдавать `lang` в `<html>` по локали (правка корневого layout затрагивает и приложение, делать отдельно). Для верификации не критично |
| `title` и `description` | Уникальные и осмысленные на каждой странице (en/ru) | Ничего |
| `canonical` | Есть и самореферентный на лендинге, Privacy, Terms | Ничего |
| `hreflang` / alternates | В HTML: `en`, `ru`, `uk`, `x-default` (верно). В HTTP-заголовке `Link` для лендинга вместо `uk` указано `hreflang="ua"` (невалидный код), а `x-default` ведёт на `/welcome` (307 → `/ru/welcome`), в HTML — на `/en/welcome` | Выровнять заголовок `Link` с HTML: `uk` вместо `ua`, `x-default` → `/en/welcome` (скорее всего это автогенерация `alternateLinks` в next-intl: отключить её или задать корректные значения) |
| Open Graph | На лендинге `og:title/description/url/image`; у Privacy/Terms без картинки | Ничего (картинка для юридических страниц не нужна) |
| Структурированные данные | На лендинге JSON-LD `WebSite` и `Organization` | Ничего |
| `<meta robots>` | `index, follow` на лендинге, Privacy, Terms. `X-Robots-Tag` нет | Ничего |
| `robots.txt` | 200: `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Sitemap: …/sitemap.xml` | Ничего. Googlebot не заблокирован (страницы под его UA отдают 200) |
| `sitemap.xml` | 200, содержит `/en`, `/ru`, `/ua` × `welcome`, `privacy`, `terms` | Ничего |
| Файл верификации Google | `/google05308b3f2bca5568.html` отдаёт 200 с верным содержимым | Ничего |
| Корень `/`, `/en`, `/ru` | `/` → 307 на `/ru`. `/en` и `/ru` — оболочка приложения (экран входа): title «Christ App», description «Bible reader and chat with Jesus», нет canonical, нет упоминания Google и контакта | В OAuth consent screen в поле «Application home page» указывать `https://christapp.ddns.net/en/welcome`, а не корень и не `/en`. Privacy/Terms: `/en/privacy`, `/en/terms` |
| Кеширование | `Cache-Control: s-maxage=31536000` на статических страницах, `x-nextjs-cache: HIT` | Если перед сервером стоит CDN/прокси, после выката новых текстов Privacy его кеш нужно сбрасывать, иначе правки не дойдут до Googlebot. Рассмотреть меньший `s-maxage` |
| Актуальность Privacy | В задеплоенной версии 9 разделов, раздела «Analytics» ещё нет (он в ветке `feat/gtm-analytics`) | После деплоя той ветки повторно проверить `/en/privacy` и сбросить кеш. Если GTM не включать, раздел Analytics нужно скорректировать |

## Английская версия лендинга

Уже существует: `/en/welcome` (200, свой title/description/canonical, `hreflang` связывает три языка), плана добавления не требуется. Остаётся только замечание про `lang` в `<html>`.

## Рекомендуемые исправления (по приоритету)

1. В OAuth-экране указать `https://christapp.ddns.net/en/welcome` как домашнюю страницу.
2. Выровнять HTTP-заголовок `Link` (`uk` вместо `ua`, `x-default` на `/en/welcome`).
3. Вернуть правильный `lang` в `<html>` для `/en/*` и `/ua/*`.
4. Проверить кеш/CDN после выката новых текстов Privacy.
