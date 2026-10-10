/** Рівномірна сітка для пошуку сусідів: перебудовується щотіку, без алокацій у steady state. */
export class SpatialGrid<T extends { x: number; y: number }> {
  private readonly buckets = new Map<number, T[]>();
  private readonly pool: T[][] = [];

  constructor(
    private readonly bucketSize: number,
    private readonly stride = 4096,
  ) {}

  clear() {
    for (const arr of this.buckets.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.buckets.clear();
  }

  private key(cx: number, cy: number) {
    return cx * this.stride + cy;
  }

  insert(item: T) {
    const k = this.key(
      Math.floor(item.x / this.bucketSize),
      Math.floor(item.y / this.bucketSize),
    );
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = this.pool.pop() ?? [];
      this.buckets.set(k, arr);
    }
    arr.push(item);
  }

  /** Усі елементи в квадраті [x±r, y±r] (грубо, фільтрація точністю - на виклику). */
  query(x: number, y: number, r: number, cb: (item: T) => void) {
    const s = this.bucketSize;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.buckets.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) cb(arr[i]);
      }
    }
  }
}
