import { NextResponse } from "next/server";
import { BACKEND, googleClientId } from "../_shared";

export const dynamic = "force-dynamic";

/** Кнопка Google має сенс лише якщо ключі задані і тут (Vercel), і на бекенді (Render). */
export async function GET() {
  const hereOk = Boolean(
    googleClientId() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  if (!hereOk) {
    return NextResponse.json({ enabled: false });
  }
  try {
    const res = await fetch(`${BACKEND}/auth/google/config`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { enabled?: boolean };
    return NextResponse.json({ enabled: data.enabled === true });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
