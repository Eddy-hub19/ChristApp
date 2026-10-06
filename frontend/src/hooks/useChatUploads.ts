"use client";

import { useCallback, useRef, useState } from "react";
import { prepareImageForUpload } from "@/lib/imageProcessing";
import { UploadError, uploadWithProgress } from "@/lib/chatUpload";
import { sanitizeVoiceDuration } from "@/lib/voiceDuration";

export type PendingUploadKind = "voice" | "image" | "file";

export type PendingUpload = {
  localId: string;
  kind: PendingUploadKind;
  roomId: string;
  fileName: string;
  fileSize: number;
  /** Локальний blob: URL для миттєвого прев'ю фото. */
  previewUrl?: string;
  width?: number;
  height?: number;
  /** Тривалість голосового, с. */
  voiceDuration?: number;
  progress: number;
  status: "preparing" | "uploading" | "error";
  errorCode?: UploadError["code"];
};

type EnqueueInput = {
  kind: PendingUploadKind;
  file: File | Blob;
  fileName?: string;
  voiceDuration?: number;
  replyToId?: string | null;
  caption?: string;
};

type UploadTarget = { roomId: string; token: string };

type Options = {
  /** Перевіряє, що кімната готова, і повертає roomId + токен (або null — тоді відправка скасовується). */
  resolveTarget: () => Promise<UploadTarget | null>;
  apiBase: string;
};

type Job = EnqueueInput & { prepared?: File | Blob; controller?: AbortController };

const ENDPOINT: Record<PendingUploadKind, string> = {
  voice: "/messages/voice",
  image: "/messages/image",
  file: "/messages/file",
};

let counter = 0;
const nextLocalId = () => `pending-${Date.now()}-${(counter += 1)}`;

export function useChatUploads({ resolveTarget, apiBase }: Options) {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const jobsRef = useRef(new Map<string, Job>());
  const resolveTargetRef = useRef(resolveTarget);
  resolveTargetRef.current = resolveTarget;

  const patch = useCallback((localId: string, next: Partial<PendingUpload>) => {
    setItems((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...next } : item)),
    );
  }, []);

  const remove = useCallback((localId: string) => {
    jobsRef.current.delete(localId);
    setItems((prev) => {
      const gone = prev.find((item) => item.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }, []);

  const run = useCallback(
    async (localId: string): Promise<boolean> => {
      const job = jobsRef.current.get(localId);
      if (!job) return false;

      const target = await resolveTargetRef.current();
      if (!target) {
        remove(localId);
        return false;
      }

      patch(localId, { roomId: target.roomId });
      try {
        if (!job.prepared) {
          if (job.kind === "image" && job.file instanceof File) {
            patch(localId, { status: "preparing", progress: 0, errorCode: undefined });
            const prepared = await prepareImageForUpload(job.file);
            job.prepared = prepared.file;
            patch(localId, {
              width: prepared.width,
              height: prepared.height,
              fileSize: prepared.file.size,
            });
          } else {
            job.prepared = job.file;
          }
        }

        const form = new FormData();
        const name =
          job.fileName ?? (job.prepared instanceof File ? job.prepared.name : "file");
        form.append("file", job.prepared, name);
        form.append("roomId", target.roomId);
        if (job.replyToId) form.append("replyToId", job.replyToId);
        if (job.caption) form.append("caption", job.caption);
        if (job.kind === "voice") {
          // Некоректну тривалість не шлемо: сервер збереже голосове і без неї.
          const duration = sanitizeVoiceDuration(job.voiceDuration);
          if (duration != null) form.append("voiceDuration", String(duration));
        }

        const controller = new AbortController();
        job.controller = controller;
        patch(localId, { status: "uploading", progress: 0, errorCode: undefined });
        await uploadWithProgress({
          url: `${apiBase}${ENDPOINT[job.kind]}`,
          token: target.token,
          form,
          signal: controller.signal,
          onProgress: (progress) => patch(localId, { progress }),
        });
        remove(localId);
        return true;
      } catch (error) {
        const uploadError =
          error instanceof UploadError ? error : new UploadError("server");
        // Технічні деталі — лише в консоль, користувачу показуємо переклад.
        console.warn("[chat-upload] failed", job.kind, uploadError.code, uploadError.status, uploadError.message);
        if (uploadError.code === "canceled") {
          remove(localId);
          return false;
        }
        patch(localId, {
          status: "error",
          errorCode: uploadError.code,
        });
        return false;
      }
    },
    [apiBase, patch, remove],
  );

  const enqueue = useCallback(
    (input: EnqueueInput): Promise<boolean> => {
      const target = input.file;
      const localId = nextLocalId();
      const fileName =
        input.fileName ?? (target instanceof File ? target.name : "voice");
      jobsRef.current.set(localId, { ...input });
      setItems((prev) => [
        ...prev,
        {
          localId,
          kind: input.kind,
          roomId: "",
          fileName,
          fileSize: target.size,
          previewUrl:
            input.kind === "image" ? URL.createObjectURL(target) : undefined,
          voiceDuration: input.voiceDuration,
          progress: 0,
          status: "preparing",
        },
      ]);
      return run(localId);
    },
    [run],
  );

  const retry = useCallback(
    (localId: string) => {
      void run(localId);
    },
    [run],
  );

  const cancel = useCallback(
    (localId: string) => {
      const job = jobsRef.current.get(localId);
      if (job?.controller) {
        job.controller.abort();
      } else {
        remove(localId);
      }
    },
    [remove],
  );

  return { items, enqueue, retry, cancel, dismiss: remove };
}
