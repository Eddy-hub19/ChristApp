"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import LoginServerWarmupPanel from "@/components/LoginServerWarmupPanel/LoginServerWarmupPanel";
import { consumePostLoginPath } from "@/lib/postLoginRedirect";
import {
  GOOGLE_REDIRECT_ERRORS,
  isKnownAuthErrorCode,
  type AuthErrorInfo,
} from "@/lib/authErrors";
import {
  checkUsernameAvailable,
  fetchGoogleEnabled,
  startGoogleRedirect,
} from "@/lib/googleAuth";
import styles from "./AuthScreen.module.scss";

type Mode = "login" | "register";
type Field = "login" | "nick" | "email" | "password";
type FieldErrors = Partial<Record<Field | "form", string>>;
type Availability = "idle" | "checking" | "free" | "taken";

const NICK_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;

/** Код ошибки сервера → поле, под которым её показываем (остальное - общий баннер в карточке). */
const CODE_FIELD: Record<string, Field> = {
  INVALID_CREDENTIALS: "password",
  USERNAME_TAKEN: "nick",
  IDENTITY_TAKEN: "nick",
  EMAIL_TAKEN: "email",
};

function GoogleLogo() {
  return (
    <svg
      className={styles.googleLogo}
      viewBox="0 0 48 48"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

/** Слабое устройство: стеклу без blur - иначе backdrop-filter тормозит прокрутку и ввод. */
function isLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) ||
    (typeof nav.hardwareConcurrency === "number" &&
      nav.hardwareConcurrency <= 2)
  );
}

export default function AuthScreen({ initialMode }: { initialMode: Mode }) {
  const t = useTranslations("auth");
  const tErr = useTranslations("authErrors");
  const tLogin = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();
  const { login, register, error, errorInfo, clearError, isSubmitting } =
    useAuth();
  useKeyboardInset();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [nick, setNick] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const [availability, setAvailability] = useState<Availability>("idle");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<AuthErrorInfo | null>(null);
  const [flat, setFlat] = useState(false);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const isRegister = mode === "register";

  useEffect(() => {
    setFlat(isLowEndDevice());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchGoogleEnabled().then((enabled) => {
      if (!cancelled) setGoogleEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Возврат из Google с ошибкой: /?googleError=email_exists. Параметр показываем и сразу убираем из адреса.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("googleError");
    if (!raw) return;
    const code = GOOGLE_REDIRECT_ERRORS[raw] ?? "GOOGLE_AUTH_FAILED";
    const minutes = Number(params.get("minutes"));
    setGoogleError({
      code,
      retryAfterMinutes:
        Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
    });
    params.delete("googleError");
    params.delete("minutes");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
  }, []);

  // Назад из Google (bfcache): кнопка не должна навсегда остаться «зависшей».
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setGoogleBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Проверка ника при регистрации: с задержкой, прошлый запрос отменяем.
  useEffect(() => {
    if (!isRegister || !NICK_RE.test(nick.trim())) {
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
  }, [isRegister, nick]);

  const translate = useCallback(
    (info: AuthErrorInfo | null, fallback?: string | null): string | null => {
      if (!info && !fallback) return null;
      if (info?.code === "NETWORK") return tErr("network");
      if (isKnownAuthErrorCode(info?.code)) {
        return tErr(info.code, { minutes: info.retryAfterMinutes ?? 1 });
      }
      if (info?.code === "GOOGLE_CANCELLED") return tErr("GOOGLE_CANCELLED");
      if (info?.code === "GOOGLE_UNAVAILABLE")
        return tErr("GOOGLE_UNAVAILABLE");
      return fallback ?? tErr("generic");
    },
    [tErr],
  );

  // Ошибки: свои (валидация) + пришедшие с сервера. Серверная привязывается к полю по коду.
  const errors = useMemo<FieldErrors>(() => {
    const out: FieldErrors = { ...localErrors };
    const serverText = translate(errorInfo, error);
    if (serverText) {
      const field = errorInfo?.code ? CODE_FIELD[errorInfo.code] : undefined;
      out[field ?? "form"] ??= serverText;
    }
    const googleText = translate(googleError);
    if (googleText) out.form ??= googleText;
    return out;
  }, [localErrors, errorInfo, error, googleError, translate]);

  const dismissServerErrors = () => {
    clearError();
    setGoogleError(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setLocalErrors({});
    setShowPassword(false);
    dismissServerErrors();
  };

  const edit =
    (setter: (v: string) => void, field: Field) => (value: string) => {
      setter(value);
      setLocalErrors((prev) => ({
        ...prev,
        [field]: undefined,
        form: undefined,
      }));
      dismissServerErrors();
    };

  const validate = (): FieldErrors => {
    const out: FieldErrors = {};
    const nickValue = nick.trim();
    if (isRegister) {
      if (!nickValue) out.nick = t("errNicknameRequired");
      else if (!NICK_RE.test(nickValue)) out.nick = t("errNicknameFormat");
      else if (availability === "taken") out.nick = t("nicknameTaken");
      const emailValue = email.trim();
      if (!emailValue) out.email = t("errEmailRequired");
      else if (!EMAIL_RE.test(emailValue)) out.email = t("errEmailInvalid");
    } else if (!nickValue) {
      out.login = t("errLoginRequired");
    } else if (!NICK_RE.test(nickValue) && !EMAIL_RE.test(nickValue)) {
      out.login = t("errLoginFormat");
    }
    if (!password) out.password = t("errPasswordRequired");
    else if (password.length < PASSWORD_MIN)
      out.password = t("errPasswordShort");
    else if (password.length > PASSWORD_MAX)
      out.password = t("errPasswordLong");
    return out;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || googleBusy) return;
    dismissServerErrors();
    const next = validate();
    setLocalErrors(next);
    if (Object.keys(next).length > 0) return;

    const ok = isRegister
      ? await register({
          email: email.trim(),
          username: nick.trim(),
          password,
        })
      : await login(nick.trim(), password);
    if (ok) {
      router.push(consumePostLoginPath() ?? "/chat");
    }
  };

  const handleGoogle = () => {
    if (googleBusy || isSubmitting) return;
    dismissServerErrors();
    setGoogleBusy(true);
    startGoogleRedirect("login", locale);
  };

  // Клавиатура на iPhone не перекрывает поле: после фокуса докручиваем его к центру видимой области.
  const handleFocusCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 320);
  };

  const nickError = isRegister ? errors.nick : errors.login;
  const busy = isSubmitting || googleBusy;

  return (
    <div
      ref={screenRef}
      className={styles.screen}
      data-glass={flat ? "flat" : undefined}
      onFocusCapture={handleFocusCapture}
    >
      <div className={styles.inner}>
        <header className={styles.brand}>
          <Image
            src="/logo.svg"
            width={44}
            height={54}
            alt=""
            priority
            className={styles.logo}
          />
          <h1 className={styles.brandName}>{tLogin("title")}</h1>
          <p className={styles.tagline}>{t("tagline")}</p>
        </header>

        <section className={styles.card} aria-labelledby="auth-card-title">
          <h2 id="auth-card-title" className={styles.srOnly}>
            {isRegister ? t("signUp") : t("signIn")}
          </h2>

          <LoginServerWarmupPanel />

          {errors.form ? (
            <p className={styles.formError} role="alert">
              {errors.form}
            </p>
          ) : null}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="auth-nick" className={styles.label}>
                {t("nicknameLabel")}
              </label>
              <input
                id="auth-nick"
                className={`${styles.input} ${nickError ? styles.inputInvalid : ""}`}
                type="text"
                value={nick}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode={isRegister ? "text" : "email"}
                enterKeyHint="next"
                placeholder={
                  isRegister
                    ? t("nicknameRegisterPlaceholder")
                    : t("nicknameLoginPlaceholder")
                }
                aria-invalid={Boolean(nickError)}
                aria-describedby="auth-nick-note"
                onChange={(e) =>
                  edit(setNick, isRegister ? "nick" : "login")(e.target.value)
                }
              />
              <p
                id="auth-nick-note"
                className={`${styles.note} ${
                  nickError || (isRegister && availability === "taken")
                    ? styles.noteError
                    : isRegister && availability === "free"
                      ? styles.noteOk
                      : ""
                }`}
                role={nickError ? "alert" : undefined}
                aria-live="polite"
              >
                {nickError ??
                  (isRegister && availability === "checking"
                    ? t("nicknameChecking")
                    : isRegister && availability === "free"
                      ? t("nicknameFree")
                      : isRegister && availability === "taken"
                        ? t("nicknameTaken")
                        : "")}
              </p>
            </div>

            {isRegister ? (
              <div className={styles.field}>
                <label htmlFor="auth-email" className={styles.label}>
                  {t("emailLabel")}
                </label>
                <input
                  id="auth-email"
                  className={`${styles.input} ${errors.email ? styles.inputInvalid : ""}`}
                  type="email"
                  value={email}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder={t("emailPlaceholder")}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby="auth-email-note"
                  onChange={(e) => edit(setEmail, "email")(e.target.value)}
                />
                <p
                  id="auth-email-note"
                  className={`${styles.note} ${errors.email ? styles.noteError : ""}`}
                  role={errors.email ? "alert" : undefined}
                >
                  {errors.email ?? ""}
                </p>
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor="auth-password" className={styles.label}>
                {t("passwordLabel")}
              </label>
              <div className={styles.passwordWrap}>
                <input
                  id="auth-password"
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.password ? styles.inputInvalid : ""}`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  enterKeyHint="go"
                  placeholder={t("passwordPlaceholder")}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby="auth-password-note"
                  onChange={(e) =>
                    edit(setPassword, "password")(e.target.value)
                  }
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? t("hidePasswordAria") : t("showPasswordAria")
                  }
                  aria-pressed={showPassword}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
              <p
                id="auth-password-note"
                className={`${styles.note} ${errors.password ? styles.noteError : ""}`}
                role={errors.password ? "alert" : undefined}
              >
                {errors.password ?? ""}
              </p>
            </div>

            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={busy}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? <Spinner /> : null}
              <span>
                {isSubmitting
                  ? isRegister
                    ? t("signingUp")
                    : t("signingIn")
                  : isRegister
                    ? t("signUp")
                    : t("signIn")}
              </span>
            </button>
          </form>
        </section>

        {googleEnabled ? (
          <>
            <div
              className={styles.divider}
              role="separator"
              aria-label={t("or")}
            >
              <span className={styles.dividerLine} />
              <span className={styles.dividerText}>{t("or")}</span>
              <span className={styles.dividerLine} />
            </div>

            <button
              type="button"
              className={styles.googleBtn}
              onClick={handleGoogle}
              disabled={busy}
              aria-busy={googleBusy}
            >
              {googleBusy ? <Spinner /> : <GoogleLogo />}
              <span>
                {googleBusy ? t("googleRedirecting") : t("continueWithGoogle")}
              </span>
            </button>
          </>
        ) : null}

        <p className={styles.switch}>
          {isRegister ? t("hasAccount") : t("noAccount")}{" "}
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => switchMode(isRegister ? "login" : "register")}
          >
            {isRegister ? t("signInLink") : t("registerLink")}
          </button>
        </p>
      </div>
    </div>
  );
}
