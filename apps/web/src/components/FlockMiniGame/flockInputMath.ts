export interface Dir {
  angle: number;
  power: number;
}

/** Курсор/палець -> напрямок від власної клітини (центр екрана). Біля клітини сила плавно спадає до 0. */
export function pointerDir(px: number, py: number, cx: number, cy: number, deadZone = 14, fullAt = 70): Dir {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d < deadZone) return { angle: Math.atan2(dy, dx), power: 0 };
  return { angle: Math.atan2(dy, dx), power: Math.min(1, (d - deadZone) / (fullAt - deadZone)) };
}

/** Віртуальний джойстик: зсув ручки відносно центру бази, радіус ходу `radius`. */
export function joystickDir(px: number, py: number, baseX: number, baseY: number, radius = 52): Dir {
  const dx = px - baseX;
  const dy = py - baseY;
  const d = Math.hypot(dx, dy);
  if (d < 6) return { angle: Math.atan2(dy, dx), power: 0 };
  return { angle: Math.atan2(dy, dx), power: Math.min(1, d / radius) };
}

/** Чи варто слати ввід: змінився кут/сила помітно або минув keepalive. */
export function inputChanged(prev: Dir | null, next: Dir, sinceMs: number, keepaliveMs = 1000) {
  if (!prev) return true;
  if (sinceMs >= keepaliveMs) return true;
  let da = Math.abs(next.angle - prev.angle);
  if (da > Math.PI) da = Math.PI * 2 - da;
  return da > 0.04 || Math.abs(next.power - prev.power) > 0.04;
}
