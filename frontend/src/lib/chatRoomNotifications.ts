/**
 * Сповіщення прочитаної кімнати: прибрати їх зі шторки на ЦЬОМУ пристрої.
 * Інші пристрої цієї ж людини бекенд синхронізує службовим push (`kind: "read-sync"`).
 */
export async function dismissRoomNotificationsLocally(roomId: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Закриваємо напряму — не всі платформи доставляють postMessage активному SW одразу.
    if (registration.getNotifications) {
      const shown = await registration.getNotifications();
      for (const notification of shown) {
        const data = notification.data as { roomId?: string } | undefined;
        if (data?.roomId === roomId) {
          notification.close();
        }
      }
    }

    registration.active?.postMessage({
      type: "CHAT_ROOM_READ",
      roomId,
    });
  } catch {
    // SW може бути недоступний (приватний режим, немає підтримки) — не критично
  }
}
