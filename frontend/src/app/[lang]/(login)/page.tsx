"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import AuthScreen from "@/components/AuthScreen/AuthScreen";
import ServerStartupScreen from "@/components/ServerStartupScreen/ServerStartupScreen";
import { useServerStartupBoot } from "@/hooks/useServerStartupBoot";
import { consumePostLoginPath } from "@/lib/postLoginRedirect";

export default function LoginPage() {
  const router = useRouter();
  const boot = useServerStartupBoot();

  // Сервер піднявся і сесія ціла (у т.ч. щойно повернулися з Google) — одразу ведемо в чати.
  useEffect(() => {
    if (boot.shouldEnterApp) {
      router.replace(consumePostLoginPath() ?? "/chat");
    }
  }, [boot.shouldEnterApp, router]);

  // Поки бекенд прокидається, показуємо екран запуску: форма входу все одно не спрацює,
  // а refresh-токен лишається на місці й підхоплюється, щойно API відповість.
  if (boot.showStartupScreen) {
    return (
      <ServerStartupScreen
        phase={boot.phase}
        elapsedSeconds={boot.elapsedSeconds}
        hasStoredSession={boot.hasStoredSession}
        canSkip={boot.canSkip}
        onSkip={boot.skip}
      />
    );
  }

  return <AuthScreen initialMode="login" />;
}
