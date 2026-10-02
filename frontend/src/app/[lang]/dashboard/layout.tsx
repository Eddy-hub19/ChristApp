import { notFound } from "next/navigation";

// Дашборд временно скрыт: маршрут отдаёт 404. Чтобы вернуть — удалить этот файл
// и включить вкладку в TabBar (showDashboardTab).
export default function DashboardLayout(): never {
  notFound();
}
