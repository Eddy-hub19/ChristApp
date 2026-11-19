"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import {
  GOOGLE_REDIRECT_ERRORS,
  isKnownAuthErrorCode,
  type AuthErrorInfo,
} from "@/lib/authErrors";
import {
  AuthApiError,
  fetchAuthMethods,
  setAccountPassword,
  startGoogleRedirect,
  unlinkGoogle,
  type AuthMethods,
} from "@/lib/googleAuth";
import styles from "./GoogleSettingsRow.module.scss";

/** Строка «Google» в «Налаштування»: подключить / отключить, показывает подключённый email (только владельцу). */
export default function GoogleSettingsRow() {
  const t = useTranslations("googleSettings");
  const tErr = useTranslations("authErrors");
  const locale = useLocale();
  const { user } = useAuth();
  const userId = user?.id;

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [busy, setBusy] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const errorText = useCallback(
    (info: AuthErrorInfo | undefined) =>
      isKnownAuthErrorCode(info?.code)
        ? tErr(info.code, { minutes: info.retryAfterMinutes ?? 1 })
        : (info?.message ?? tErr("generic")),
    [tErr],
  );

  const reload = useCallback(async () => {
    try {
      setMethods(await fetchAuthMethods());
    } catch {
      setMethods(null);
    }
  }, []);

  // Токен доступа появляется после восстановления сессии: без пользователя запрос ушёл бы без Authorization.
  useEffect(() => {
    if (userId) void reload();
  }, [userId, reload]);

  // Возврат из Google: /profile?google=linked или ?googleError=already_linked
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("google") === "linked";
    const err = params.get("googleError");
    if (!ok && !err) return;
    if (ok) {
      setMessage({ ok: true, text: t("linked") });
    } else if (err) {
      const code = GOOGLE_REDIRECT_ERRORS[err] ?? "GOOGLE_AUTH_FAILED";
      const minutes = Number(params.get("minutes"));
      setMessage({
        ok: false,
        text:
          code === "GOOGLE_CANCELLED" || code === "GOOGLE_UNAVAILABLE"
            ? tErr(code)
            : errorText({
                code,
                retryAfterMinutes:
                  Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
              }),
      });
    }
    for (const key of ["google", "googleError", "minutes"]) params.delete(key);
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
  }, [t, tErr, errorText]);

  if (!methods) return null;

  const linked = methods.google;

  const handleConnect = () => {
    setBusy(true);
    setMessage(null);
    startGoogleRedirect("link", locale);
  };

  const handleDisconnect = async () => {
    setMessage(null);
    // единственный способ входа: сначала пароль
    if (!methods.hasPassword) {
      setAskPassword(true);
      return;
    }
    if (!window.confirm(t("confirmDisconnect"))) return;
    setBusy(true);
    try {
      await unlinkGoogle();
      setMessage({ ok: true, text: t("unlinked") });
      await reload();
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof AuthApiError ? errorText(e.info) : tErr("network"),
      });
      if (e instanceof AuthApiError && e.info.code === "LAST_LOGIN_METHOD") {
        setAskPassword(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSavePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await setAccountPassword(password);
      setPassword("");
      setAskPassword(false);
      setMessage({ ok: true, text: t("passwordSaved") });
      await reload();
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof AuthApiError ? errorText(e.info) : tErr("network"),
      });
    } finally {
      setBusy(false);
    }
  };

  const canConnect = methods.googleEnabled;

  return (
    <div className={styles.wrap}>
      <div className={base.row} style={{ cursor: "default" }}>
        <span className={base.rowIcon} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
            <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
          </svg>
        </span>
        <span className={base.rowTitle}>{t("title")}</span>
        <span className={base.current}>
          <span className={base.currentName}>
            {linked ? linked.email : t("notConnected")}
          </span>
        </span>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={linked ? handleDisconnect : handleConnect}
          disabled={busy || (!linked && !canConnect)}
          title={!linked && !canConnect ? t("unavailable") : undefined}
          aria-busy={busy}
        >
          {busy ? t("working") : linked ? t("disconnect") : t("connect")}
        </button>
      </div>

      {askPassword ? (
        <form className={styles.passwordForm} onSubmit={handleSavePassword}>
          <p className={styles.passwordTitle}>{t("needPasswordTitle")}</p>
          <p className={styles.hint}>{t("needPasswordHint")}</p>
          <input
            className={styles.input}
            type="password"
            value={password}
            autoComplete="new-password"
            minLength={6}
            maxLength={72}
            placeholder={t("passwordPlaceholder")}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className={styles.passwordActions}>
            <button
              type="submit"
              className={styles.actionBtn}
              disabled={busy || password.length < 6}
            >
              {t("savePassword")}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setAskPassword(false);
                setPassword("");
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <p
          className={`${styles.message} ${message.ok ? styles.messageOk : styles.messageError}`}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
