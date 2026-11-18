import axios, { type AxiosError } from "axios";

export type UploadErrorCode =
  | "offline"
  | "timeout"
  | "tooLarge"
  | "unsupported"
  | "server"
  | "canceled"
  | "auth";

export class UploadError extends Error {
  constructor(
    public code: UploadErrorCode,
    public status?: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type UploadRequest = {
  url: string;
  token: string;
  form: FormData;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Таймаут без жодного прогресу (мс): повільна, але жива мережа не обривається. */
  stallTimeoutMs?: number;
  /** Скільки разів автоматично повторити після збою мережі/таймауту. */
  retries?: number;
};

const DEFAULT_STALL_TIMEOUT_MS = 30_000;

function classify(error: unknown): UploadError {
  if (error instanceof UploadError) return error;
  if (axios.isCancel(error)) return new UploadError("canceled");
  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  if (status === 401 || status === 403) return new UploadError("auth", status);
  if (status === 413) return new UploadError("tooLarge", status);
  if (status === 400 || status === 415) {
    return new UploadError("unsupported", status, readServerText(axiosError));
  }
  if (status) return new UploadError("server", status, readServerText(axiosError));
  if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
    return new UploadError("timeout");
  }
  return new UploadError(
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "server",
  );
}

function readServerText(error: AxiosError): string | undefined {
  const data = error.response?.data as { message?: unknown } | string | undefined;
  if (typeof data === "string") return data.slice(0, 200) || undefined;
  const message = data?.message;
  if (typeof message === "string") return message.slice(0, 200);
  if (Array.isArray(message)) return message.join(", ").slice(0, 200);
  return undefined;
}

function isRetryable(error: UploadError): boolean {
  return error.code === "timeout" || error.code === "offline" || (error.code === "server" && (error.status ?? 0) >= 500) || (error.code === "server" && error.status === undefined);
}

/**
 * POST multipart з прогресом, скасуванням, «stall»-таймаутом (обрив лише якщо немає прогресу)
 * і кількома автоматичними повторами при збої мережі.
 */
export async function uploadWithProgress(request: UploadRequest): Promise<unknown> {
  const {
    url,
    token,
    form,
    signal,
    onProgress,
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    retries = 1,
  } = request;

  let lastError: UploadError = new UploadError("server");
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new UploadError("canceled");
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new UploadError("offline");
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, stallTimeoutMs);
    };

    try {
      armStall();
      onProgress?.(0);
      const response = await axios.post(url, form, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
        signal: controller.signal,
        onUploadProgress: (event) => {
          armStall();
          if (event.total) onProgress?.(Math.min(1, event.loaded / event.total));
        },
      });
      onProgress?.(1);
      return response.data;
    } catch (error) {
      lastError =
        stalled && !signal?.aborted ? new UploadError("timeout") : classify(error);
      if (lastError.code === "canceled" || !isRetryable(lastError)) throw lastError;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError;
}
