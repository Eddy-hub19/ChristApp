"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import AuthBackdrop from "@/components/AuthBackdrop/AuthBackdrop";
import { Link } from "@/i18n/navigation";
import { AuthApiError } from "@/lib/googleAuth";
import { isKnownAuthErrorCode } from "@/lib/authErrors";
import { readResetTokenFromHash, resetPassword } from "@/lib/passwordReset";
import styles from "@/components/AuthScreen/AuthScreen.module.scss";

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;

/** Екран задання нового пароля за одноразовою ссилкою від адміна (/reset-password#token=...). */
export default function ResetPasswordScreen() {
  const t = useTranslations("resetPassword");
  const tErr = useTranslations("authErrors");
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(readResetTokenFromHash(window.location.hash));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !token) return;
    if (password.length < PASSWORD_MIN) return setError(t("errShort"));
    if (password.length > PASSWORD_MAX) return setError(t("errLong"));
    if (password !== confirm) return setError(t("errMismatch"));
    setError(null);
    setBusy(true);
    try {
      await resetPassword(token, password);
      // токен одноразовий: прибираємо його з адреси, щоб не лишався в історії
      window.history.replaceState(null, "", window.location.pathname);
      setDone(true);
    } catch (e) {
      const info = e instanceof AuthApiError ? e.info : undefined;
      if (info?.code === "NETWORK") setError(tErr("network"));
      else if (isKnownAuthErrorCode(info?.code)) {
        setError(tErr(info.code, { minutes: info.retryAfterMinutes ?? 1 }));
      } else setError(tErr("generic"));
    } finally {
      setBusy(false);
    }
  };

  const missing = token === "";

  return (
    <div className={styles.screen}>
      <AuthBackdrop />
      <div className={styles.inner}>
        <header className={styles.brand}>
          <Image src="/logo.svg" width={44} height={54} alt="" priority className={styles.logo} />
          <h1 className={styles.brandName}>{t("title")}</h1>
        </header>

        <section className={styles.card}>
          {done ? (
            <>
              <p className={styles.note} role="status">
                {t("success")}
              </p>
              <Link href="/login" className={styles.primaryBtn}>
                {t("toLogin")}
              </Link>
            </>
          ) : missing ? (
            <p className={styles.formError} role="alert">
              {t("noToken")}
            </p>
          ) : (
            <>
              {error ? (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              ) : null}
              <form className={styles.form} onSubmit={handleSubmit} noValidate>
                <div className={styles.field}>
                  <label htmlFor="reset-password" className={styles.label}>
                    {t("newPassword")}
                  </label>
                  <input
                    id="reset-password"
                    className={styles.input}
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    enterKeyHint="next"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="reset-password-confirm" className={styles.label}>
                    {t("confirmPassword")}
                  </label>
                  <input
                    id="reset-password-confirm"
                    className={styles.input}
                    type="password"
                    value={confirm}
                    autoComplete="new-password"
                    enterKeyHint="go"
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={busy || token === null}
                  aria-busy={busy}
                >
                  <span>{busy ? t("saving") : t("submit")}</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
