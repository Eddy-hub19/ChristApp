"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  type RegisterFieldErrors,
  validateRegisterForm,
} from "@/lib/formValidation";
import LoginServerWarmupPanel from "@/components/LoginServerWarmupPanel/LoginServerWarmupPanel";
import styles from "@/app/[lang]/(login)/login.module.scss";

export default function RegisterPage() {
  const t = useTranslations("register");
  const router = useRouter();
  const { error, register, isSubmitting } = useAuth();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});

  const handleNavigateToLogin = () => {
    router.push("/");
  };

  const handleRegisterSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const normalizedUsername = username.trim();

    const nextErrors = validateRegisterForm({
      email: normalizedEmail,
      username: normalizedUsername,
      password,
    });

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const success = await register({
      email: normalizedEmail,
      username: normalizedUsername,
      password,
    });

    if (success) {
      router.push("/chat");
    }
  };

  return (
    <section className={styles.loginPage}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <Image
              src="/logo.svg"
              width={36}
              height={44}
              alt="Logo"
              className={styles.logo}
            />
          </div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </header>

        <LoginServerWarmupPanel />

        {error && (
          <div className={styles.errorWrap}>
            <p className={styles.error}>{error}</p>
          </div>
        )}

        <form
          className={styles.form}
          onSubmit={handleRegisterSubmit}
          noValidate
        >
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>
              {t("emailLabel")}
            </label>
            <input
              id="email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputInvalid : ""}`}
              type="email"
              value={email}
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
            />
            {fieldErrors.email && (
              <p className={styles.fieldError}>{fieldErrors.email}</p>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="username" className={styles.label}>
              {t("usernameLabel")}
            </label>
            <input
              id="username"
              className={`${styles.input} ${fieldErrors.username ? styles.inputInvalid : ""}`}
              value={username}
              autoComplete="username"
              placeholder={t("usernamePlaceholder")}
              aria-invalid={Boolean(fieldErrors.username)}
              onChange={(e) => {
                setUsername(e.target.value);
                setFieldErrors((prev) => ({ ...prev, username: undefined }));
              }}
            />
            {fieldErrors.username && (
              <p className={styles.fieldError}>{fieldErrors.username}</p>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="password" className={styles.label}>
              {t("passwordLabel")}
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                className={`${styles.input} ${styles.inputWithPasswordToggle} ${
                  fieldErrors.password ? styles.inputInvalid : ""
                }`}
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="new-password"
                placeholder={t("passwordPlaceholder")}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              <button
                type="button"
                className={`${styles.passwordToggleBtn} ${showPassword ? styles.passwordToggleBtnActive : ""}`}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? t("hidePasswordAria") : t("showPasswordAria")
                }
                aria-pressed={showPassword}
              >
                <Image
                  src="/icon-password.svg"
                  alt=""
                  width={22}
                  height={22}
                  aria-hidden
                />
              </button>
            </div>
            {fieldErrors.password && (
              <p className={styles.fieldError}>{fieldErrors.password}</p>
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.button}
            >
              {isSubmitting ? t("signingUp") : t("signUp")}
            </button>
          </div>
        </form>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            {t("hasAccount")}{" "}
            <span
              className={styles.registerLink}
              onClick={handleNavigateToLogin}
            >
              {t("signIn")}
            </span>
          </p>
        </footer>
      </section>
    </section>
  );
}
