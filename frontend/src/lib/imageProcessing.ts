import { IMAGE_MAX_SIDE_PX } from "@/lib/chatMedia";

export type PreparedImage = {
  file: File;
  width?: number;
  height?: number;
};

async function decode(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
} | null> {
  try {
    // imageOrientation: "from-image" враховує EXIF-поворот фото з телефона.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // HEIC у Chrome/Firefox не декодується — відправимо оригінал, конвертація на сервері.
    return null;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Зменшує фото до `IMAGE_MAX_SIDE_PX` по довгій стороні та стискає (JPEG для фото, PNG/WebP зберігаються),
 * повертає розміри для резервування місця в чаті. GIF не чіпаємо (щоб не втратити анімацію).
 * Якщо файл не вдалося декодувати — повертається оригінал без розмірів.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (file.type === "image/gif") {
    const probe = await decode(file);
    const size = probe ? { width: probe.width, height: probe.height } : {};
    probe?.close();
    return { file, ...size };
  }

  const decoded = await decode(file);
  if (!decoded) return { file };

  try {
    const { width, height } = decoded;
    const scale = Math.min(1, IMAGE_MAX_SIDE_PX / Math.max(width, height));
    const needsResize = scale < 1;
    const alreadySmall = file.size <= 1.5 * 1024 * 1024;
    const keepAsIs =
      !needsResize &&
      alreadySmall &&
      (file.type === "image/jpeg" ||
        file.type === "image/png" ||
        file.type === "image/webp");
    if (keepAsIs) return { file, width, height };

    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, width, height };
    ctx.drawImage(decoded.source, 0, 0, targetW, targetH);

    const keepAlpha = file.type === "image/png" || file.type === "image/webp";
    const outType = keepAlpha ? "image/webp" : "image/jpeg";
    const blob = await canvasToBlob(canvas, outType, 0.86);
    if (!blob || blob.type !== outType || blob.size >= file.size) {
      // Не вийшло стиснути краще за оригінал (або браузер не вміє WebP) — шлемо як є.
      return { file, width, height };
    }
    const ext = outType === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([blob], `${baseName}.${ext}`, {
        type: outType,
        lastModified: Date.now(),
      }),
      width: targetW,
      height: targetH,
    };
  } finally {
    decoded.close();
  }
}
