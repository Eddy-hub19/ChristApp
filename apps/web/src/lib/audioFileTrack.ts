import { repairMojibakeName } from "@/lib/chatMedia";
import type { Message } from "@/types/message";
import type { AudioTrack } from "@/providers/PlayerProvider";

export function isAudioFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "mp3" || ext === "m4a";
}

/** Ім'я файлу для показу: підпис повідомлення або останній сегмент URL (з виправленням «кракозябрів»). */
export function getFileDisplayName(content: string | undefined, fileUrl: string): string {
  const raw = content?.trim();
  if (raw) return repairMojibakeName(raw);
  try {
    const segment = new URL(fileUrl).pathname.split("/").filter(Boolean).pop();
    return segment ? repairMojibakeName(decodeURIComponent(segment)) : "file";
  } catch {
    return "file";
  }
}

/** Трек з аудіофайлу в чаті; `null`, якщо повідомлення - не аудіофайл. */
export function audioTrackFromMessage(message: Message, roomId?: string): AudioTrack | null {
  const url = message.fileUrl?.trim();
  if (message.type !== "FILE" || !url) return null;
  const name = getFileDisplayName(message.content, url);
  if (!isAudioFileName(name)) return null;
  return {
    id: message.id,
    audioUrl: url,
    title: name.replace(/\.[^.]+$/, "") || name,
    artist: message.username || undefined,
    roomId,
  };
}
