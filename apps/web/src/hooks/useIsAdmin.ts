"use client";

import { useAuth } from "@/hooks/useAuth";
import { canSeeAdminPanelNav } from "@/lib/adminDashboardNav";

/**
 * Чи адмін поточний користувач: `null`, поки профіль ще не відомий (нічого адмінського не малюємо),
 * далі `true`/`false`. Те саме рішення, що й серверний `AdminGuard` (allowlist за @username).
 */
export function useIsAdmin(): boolean | null {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return false;
  return canSeeAdminPanelNav(user.username);
}
