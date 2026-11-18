"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import { getHttpApiBase } from "@/lib/apiBase";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { isKnownAuthErrorCode } from "@/lib/authErrors";
import { consumePostLoginPath } from "@/lib/postLoginRedirect";
import {
  AuthApiError,
  checkUsernameAvailable,
  chooseNickname,
} from "@/lib/googleAuth";
import styles from "@/components/AuthScreen/AuthScreen.module.scss";

const NICK_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * Первый вход через Google: имя и фото подтянуты из Google (можно сменить), нужно выбрать @username.
 * Пока ник не выбран, сервер отвечает 403 NICKNAME_REQUIRED, а AuthSessionSync возвращает сюда с любой страницы.
 */
export default function ChooseNicknamePage() {
  const t = useTranslations("chooseNickname");
  const tAuth = useTranslations("auth");
  const tErr = useTranslations("authErrors");
  const router = useRouter();
  const { user, loading, logout, refreshSession } = useAuth({
    redirectIfUnauthenticated: "/",
  });
  useKeyboardInset();

  const [name, setName] = useState("");
  const [nick, setNick] = useState("");
  const [availability, setAvailability] = useState<
    "idle" | "checking" | "free" | "taken"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const nameTouched = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Имя из Google подставляем один раз, дальше поле принадлежит пользователю.
  useEffect(() => {
    if (user?.nickname && !nameTouched.current && !name) setName(user.nickname);
  }, [user?.nickname, name]);

  // Ник уже выбран (зашли сюда вручную) - в приложение.
  useEffect(() => {
    if (user && user.usernameChosen !== false) {
      router.replace(consumePostLoginPath() ?? "/chat");
    }
  }, [user, router]);

  useEffect(() => {
    if (!NICK_RE.test(nick.trim())) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const controller = new AbortController();
    const id = window.setTimeout(() => {
      checkUsernameAvailable(nick.trim(), controller.signal)
        .then((r) => setAvailability(r.available ? "free" : "taken"))
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") {
            setAvailability("idle");
          }
        });
    }, 450);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [nick]);

  const avatarSrc = (() => {
    const base = resolvePublicAvatarUrl(user?.avatarUrl);
    if (!base) return undefined;
    return avatarBust && !base.includes("googleusercontent")
      ? `${base}${base.includes("?") ? "&" : "?"}v=${avatarBust}`
      : base;
  })();

  const handleAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const token = getAuthToken();
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await apiFetch(`${getHttpApiBase()}/users/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        setError(t("avatarError"));
        return;
      }
      await refreshSession();
      setAvatarBust(Date.now());
    } catch {
      setError(t("avatarError"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const username = nick.trim();
    if (!username) return setError(tAuth("errNicknameRequired"));
    if (!NICK_RE.test(username)) return setError(tAuth("errNicknameFormat"));
    if (availability === "taken") return setError(tAuth("nicknameTaken"));

    setSaving(true);
    setError(null);
    try {
      await chooseNickname({ username, nickname: name.trim() || undefined });
      await refreshSession();
      router.replace(consumePostLoginPath() ?? "/chat");
    } catch (e) {
      if (e instanceof AuthApiError) {
        const code = e.info.code;
        setError(
          isKnownAuthErrorCode(code)
            ? tErr(code, { minutes: e.info.retryAfterMinutes ?? 1 })
            : (e.info.message ?? tErr("generic")),
        );
        if (code === "USERNAME_TAKEN") setAvailability("taken");
      } else {
        setError(tErr("network"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  const initials = (user.nickname ?? user.username).slice(0, 2).toUpperCase();
  const note =
    error ??
    (availability === "checking"
      ? tAuth("nicknameChecking")
      : availability === "free"
        ? tAuth("nicknameFree")
        : availability === "taken"
          ? tAuth("nicknameTaken")
          : "");

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <header className={styles.brand}>
          <h1 className={styles.brandName}>{t("title")}</h1>
          <p className={styles.tagline}>{t("subtitle")}</p>
        </header>

        <section className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.avatarRow}>
              <AvatarWithFallback
                src={avatarSrc}
                initials={initials}
                colorSeed={user.id}
                width={64}
                height={64}
                imageClassName={styles.avatarImg}
                fallbackClassName={styles.avatarFallback}
                fallbackTag="span"
                fallbackTint="onError"
              />
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saving}
              >
                {uploading ? t("avatarUploading") : t("avatarChange")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatar}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="cn-name" className={styles.label}>
                {t("nameLabel")}
              </label>
              <input
                id="cn-name"
                className={styles.input}
                value={name}
                maxLength={40}
                autoComplete="name"
                enterKeyHint="next"
                placeholder={t("namePlaceholder")}
                onChange={(e) => {
                  nameTouched.current = true;
                  setName(e.target.value);
                }}
              />
              <p className={styles.note} />
            </div>

            <div className={styles.field}>
              <label htmlFor="cn-nick" className={styles.label}>
                {t("usernameLabel")}
              </label>
              <input
                id="cn-nick"
                className={`${styles.input} ${error || availability === "taken" ? styles.inputInvalid : ""}`}
                value={nick}
                maxLength={20}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder={t("usernamePlaceholder")}
                aria-invalid={Boolean(error) || availability === "taken"}
                aria-describedby="cn-nick-note"
                onChange={(e) => {
                  setNick(e.target.value);
                  setError(null);
                }}
              />
              <p
                id="cn-nick-note"
                aria-live="polite"
                role={error ? "alert" : undefined}
                className={`${styles.note} ${
                  error || availability === "taken"
                    ? styles.noteError
                    : availability === "free"
                      ? styles.noteOk
                      : ""
                }`}
              >
                {note}
              </p>
            </div>

            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={saving || uploading}
              aria-busy={saving}
            >
              {saving ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : null}
              <span>{saving ? t("saving") : t("save")}</span>
            </button>
          </form>
        </section>

        <p className={styles.switch}>
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => void logout()}
          >
            {t("logout")}
          </button>
        </p>
      </div>
    </div>
  );
}
