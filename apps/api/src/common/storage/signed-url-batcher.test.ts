import { describe, expect, it, vi } from 'vitest';
import { SignedUrlBatcher } from './signed-url-batcher';

describe('SignedUrlBatcher', () => {
  it('signs every link asked for at the same moment in one request', async () => {
    const signMany = vi.fn(async (paths: string[]) => paths.map((p) => `signed:${p}`));
    const batcher = new SignedUrlBatcher(signMany);
    const urls = await Promise.all(['a', 'b', 'a', 'c'].map((p) => batcher.sign(p, 600)));
    expect(urls).toEqual(['signed:a', 'signed:b', 'signed:a', 'signed:c']);
    expect(signMany).toHaveBeenCalledTimes(1);
    expect(signMany).toHaveBeenCalledWith(['a', 'b', 'c'], 600);
  });

  it('reuses a link until it is close to expiring', async () => {
    let now = 0;
    const signMany = vi.fn(async (paths: string[]) => paths.map((p) => `signed:${p}:${now}`));
    const batcher = new SignedUrlBatcher(signMany, () => now);
    expect(await batcher.sign('a', 600)).toBe('signed:a:0');
    now = 7 * 60_000; // 3 minutes left: reused
    expect(await batcher.sign('a', 600)).toBe('signed:a:0');
    now = 9 * 60_000; // 1 minute left: signed again
    expect(await batcher.sign('a', 600)).toBe(`signed:a:${9 * 60_000}`);
    expect(signMany).toHaveBeenCalledTimes(2);
  });

  it('splits large batches, keeps different lifetimes apart and reports failures per link', async () => {
    const signMany = vi.fn(async (paths: string[]) => paths.map((p) => (p === 'bad' ? null : `s:${p}`)));
    const batcher = new SignedUrlBatcher(signMany, Date.now, 2);
    const results = await Promise.allSettled([batcher.sign('a', 600), batcher.sign('b', 600), batcher.sign('c', 600), batcher.sign('bad', 60)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'rejected']);
    expect(signMany).toHaveBeenCalledTimes(3); // [a, b], [c] for 600 s; [bad] for 60 s
  });

  it('rejects everyone in a batch when the request fails', async () => {
    const batcher = new SignedUrlBatcher(async () => {
      throw new Error('storage down');
    });
    await expect(batcher.sign('a', 600)).rejects.toThrow('storage down');
  });
});
