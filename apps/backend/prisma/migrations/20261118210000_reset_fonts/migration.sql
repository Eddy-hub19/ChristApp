-- Выбор шрифтов убран: у всех шрифт приложения по умолчанию.
-- 1) Ключ шрифта профиля (inter | achiko | bodoni-moda) -> по умолчанию.
UPDATE "User" SET "themeFontKey" = NULL WHERE "themeFontKey" IS NOT NULL;

-- 2) Личные шрифты (fontPrefs: ui, msg, size): шрифты сбрасываем, размер текста сохраняем.
--    Если размер обычный ("md") - запись удаляется целиком.
UPDATE "User"
SET "fontPrefs" = CASE
  WHEN COALESCE("fontPrefs"->>'size', 'md') IN ('sm', 'lg')
    THEN jsonb_build_object('v', 1, 'ui', 'as-is', 'msg', 'as-is', 'size', "fontPrefs"->>'size')
  ELSE NULL
END
WHERE "fontPrefs" IS NOT NULL;
