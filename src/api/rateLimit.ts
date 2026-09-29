/**
 * Ogranicznik zapytań (okno przesuwne). Chroni przed przekroczeniem limitów zewnętrznych API
 * – np. Open Food Facts blokuje IP po przekroczeniu 10 wyszukiwań/min.
 */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    public readonly max: number,
    public readonly windowMs: number,
    private now: () => number = () => Date.now(),
  ) {}

  private prune(): void {
    const t = this.now() - this.windowMs;
    this.stamps = this.stamps.filter((s) => s > t);
  }

  /** Próbuje zająć slot. Zwraca true, jeśli zapytanie może zostać wysłane. */
  tryTake(): boolean {
    this.prune();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(this.now());
    return true;
  }

  /** Ile ms do zwolnienia najbliższego slotu. */
  waitMs(): number {
    this.prune();
    if (this.stamps.length < this.max) return 0;
    return Math.max(0, this.stamps[0] + this.windowMs - this.now());
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryInMs: number, source: string) {
    super(`Limit zapytań do ${source} – spróbuj za ${Math.ceil(retryInMs / 1000)} s.`);
    this.name = 'RateLimitedError';
  }
}

/** Zwraca promise rozwiązywany po `ms`, przerywany przez AbortSignal. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
