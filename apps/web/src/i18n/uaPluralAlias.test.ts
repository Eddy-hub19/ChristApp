import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import "./uaPluralAlias";
import ua from "../../messages/ua.json";
import ru from "../../messages/ru.json";
import en from "../../messages/en.json";

type Msgs = Record<string, unknown>;
const get = (m: Msgs, path: string) =>
  path.split(".").reduce<unknown>((o, k) => (o as Msgs)[k], m);

function plural(locale: "ua" | "ru" | "en", messages: Msgs, key: string, count: number) {
  const t = createTranslator({ locale, messages });
  return (t as unknown as (k: string, v: object) => string)(key, { count });
}

describe("ICU plurals per locale", () => {
  it("online counter: ua / ru / en", () => {
    const run = (locale: "ua" | "ru" | "en", src: Msgs, n: number) =>
      plural(locale, { a: { x: get(src, "chat.usersOnlineCount") } }, "a.x", n);
    expect([1, 2, 5].map((n) => run("ua", ua as Msgs, n))).toEqual([
      "1 учасник онлайн", "2 учасники онлайн", "5 учасників онлайн",
    ]);
    expect([1, 2, 5].map((n) => run("ru", ru as Msgs, n))).toEqual([
      "1 участник онлайн", "2 участника онлайн", "5 участников онлайн",
    ]);
    expect([1, 2].map((n) => run("en", en as Msgs, n))).toEqual(["1 user online", "2 users online"]);
  });

  it("ua uses Ukrainian rules (alias ua → uk)", () => {
    const m = { a: { x: get(ua as Msgs, "cinema.members") } } as Msgs;
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural("ua", m, "a.x", n))).toEqual([
      "1 учасник", "2 учасники", "5 учасників", "11 учасників", "21 учасник", "22 учасники", "25 учасників",
    ]);
  });
  it("ru and en keep their own rules", () => {
    const mr = { a: { x: get(ru as Msgs, "cinema.members") } } as Msgs;
    expect([1, 2, 5, 21].map((n) => plural("ru", mr, "a.x", n))).toEqual([
      "1 участник", "2 участника", "5 участников", "21 участник",
    ]);
    const me = { a: { x: get(en as Msgs, "cinema.members") } } as Msgs;
    expect([1, 2].map((n) => plural("en", me, "a.x", n))).toEqual(["1 member", "2 members"]);
  });
});
