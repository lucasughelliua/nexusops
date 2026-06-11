/**
 * Ejecuta `fn` sobre cada elemento de `items` con un máximo de `concurrency`
 * tareas en simultáneo. Útil para no saturar APIs externas (rate limits)
 * cuando necesitamos pedir el detalle de muchas órdenes.
 */
export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}
