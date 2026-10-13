/**
 * Signs private file links in batches and remembers them. The storage server is far away
 * (each request 0.2–1 s), and pages need many links at once: every link asked for in the
 * same moment goes out as ONE request, and a link is reused until it is close to expiring.
 */
export class SignedUrlBatcher {
  private readonly cache = new Map<string, { url: string; expiresAt: number }>();
  private queue = new Map<number, Map<string, { resolve: (url: string) => void; reject: (e: Error) => void }[]>>();
  private scheduled = false;

  constructor(
    /** One request for many paths; null for a path that could not be signed. */
    private readonly signMany: (paths: string[], expiresInSeconds: number) => Promise<(string | null)[]>,
    private readonly now: () => number = Date.now,
    private readonly maxBatch = 100,
    private readonly maxCached = 5000,
  ) {}

  sign(path: string, expiresInSeconds: number): Promise<string> {
    const key = `${expiresInSeconds}:${path}`;
    const hit = this.cache.get(key);
    // Reuse while it has more than a fifth of its life (at most 2 minutes) left.
    const margin = Math.min(120_000, expiresInSeconds * 200);
    if (hit && hit.expiresAt - this.now() > margin) return Promise.resolve(hit.url);
    return new Promise((resolve, reject) => {
      const batch = this.queue.get(expiresInSeconds) ?? new Map();
      this.queue.set(expiresInSeconds, batch);
      batch.set(path, [...(batch.get(path) ?? []), { resolve, reject }]);
      if (!this.scheduled) {
        this.scheduled = true;
        setImmediate(() => void this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    this.scheduled = false;
    const queued = this.queue;
    this.queue = new Map();
    await Promise.all(
      [...queued].flatMap(([ttl, waiters]) => {
        const paths = [...waiters.keys()];
        const chunks: string[][] = [];
        for (let i = 0; i < paths.length; i += this.maxBatch) chunks.push(paths.slice(i, i + this.maxBatch));
        return chunks.map(async (chunk) => {
          try {
            const urls = await this.signMany(chunk, ttl);
            chunk.forEach((path, i) => {
              const url = urls[i];
              for (const w of waiters.get(path) ?? []) {
                if (url) w.resolve(url);
                else w.reject(new Error(`Could not sign ${path}`));
              }
              if (url) this.remember(`${ttl}:${path}`, url, this.now() + ttl * 1000);
            });
          } catch (e) {
            const error = e instanceof Error ? e : new Error('Could not sign files');
            for (const path of chunk) for (const w of waiters.get(path) ?? []) w.reject(error);
          }
        });
      }),
    );
  }

  private remember(key: string, url: string, expiresAt: number): void {
    this.cache.delete(key);
    this.cache.set(key, { url, expiresAt });
    // Drop the oldest links when the memory cap is reached.
    while (this.cache.size > this.maxCached) this.cache.delete(this.cache.keys().next().value!);
  }
}
