"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/** Код админки грузится лише для адміна: решта користувачів його не завантажує. */
const AdminDashboard = dynamic(() => import("./AdminDashboard"), { ssr: false });

/**
 * Оболонка `/admin`: поки роль невідома - порожньо (без «Завантаження» й мигання); не-адмін одразу
 * переходить на головний екран, неавторизований - на вхід. Сервер перевіряє права окремо (`AdminGuard`).
 */
export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();

  useEffect(() => {
    if (isAdmin === null || isAdmin) return;
    router.replace(user ? "/chat" : "/");
  }, [isAdmin, user, router]);

  if (!isAdmin) return null;
  return <AdminDashboard />;
}
