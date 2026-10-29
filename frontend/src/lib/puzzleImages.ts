import { apiFetch } from "@/lib/apiFetch";
import { getHttpApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";

/** Своя картинка для «Пазлів» (мої картинки). */
export type MyPuzzleImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  showAuthor: boolean;
  createdAt: string;
};

/** Код помилки сервера (BadRequest/Forbidden message) або "generic". */
export class PuzzleImageError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new PuzzleImageError("no_token", 401);
  const res = await apiFetch(`${getHttpApiBase()}/puzzle-images${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    throw new PuzzleImageError(typeof body.message === "string" ? body.message : "generic", res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const uploadPuzzleImage = (blob: Blob, showAuthor: boolean) => {
  const form = new FormData();
  form.append("image", blob, "puzzle.webp");
  form.append("showAuthor", String(showAuthor));
  return request<MyPuzzleImage>("", { method: "POST", body: form });
};

export const fetchMyPuzzleImages = () => request<MyPuzzleImage[]>("/mine");

export const deletePuzzleImage = (id: string) => request<void>(`/${id}`, { method: "DELETE" });

export const setPuzzleImageShowAuthor = (id: string, showAuthor: boolean) =>
  request<MyPuzzleImage>(`/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showAuthor }),
  });

/** Стискає вирізану квадратну область у WebP: ≤ maxSide px, ≤ maxBytes; Canvas не переносить EXIF і геодані. */
export async function encodeSquareWebp(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  side: number,
  maxSide = 1200,
  maxBytes = 2 * 1024 * 1024,
): Promise<Blob> {
  let out = Math.min(maxSide, Math.round(side));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PuzzleImageError("encode_failed", 0);
    ctx.drawImage(source, sx, sy, side, side, 0, 0, out, out);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= maxBytes) return blob;
    }
    out = Math.round(out * 0.8);
  }
  throw new PuzzleImageError("too_large", 0);
}
