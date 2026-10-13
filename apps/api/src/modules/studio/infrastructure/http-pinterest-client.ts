import { Inject, Injectable } from '@nestjs/common';
import type { PinterestBoardDto, PinterestPinDto } from '@abaya/contracts';
import { APP_CONFIG, type AppConfig } from '../../../common/config/config.module';
import { UpstreamError } from '../../../common/errors/domain-error';
import type { PinterestClient } from '../application/ports/studio.ports';

const TIMEOUT_MS = 8_000;

interface ApiPin {
  id: string;
  title?: string | null;
  media?: { images?: Record<string, { url?: string }> };
}

/**
 * Pinterest's official endpoints only: oEmbed for a pasted pin link (no key needed) and API v5
 * for the company's own boards (PINTEREST_ACCESS_TOKEN). Reads metadata and image addresses;
 * never downloads the images.
 */
@Injectable()
export class HttpPinterestClient implements PinterestClient {
  private readonly token: string | null;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'PINTEREST_ACCESS_TOKEN'>) {
    this.token = config.PINTEREST_ACCESS_TOKEN ?? null;
  }

  get connected(): boolean {
    return this.token !== null;
  }

  async canonicalUrl(url: string): Promise<string> {
    if (!/^https:\/\/pin\.it\//i.test(url)) return url;
    // Short links redirect to the pin; read only the Location header.
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      const location = response.headers.get('location');
      if (location) {
        const target = new URL(location, url);
        target.search = '';
        return target.toString();
      }
    } catch {
      // fall through: oEmbed may still understand the short link
    }
    return url;
  }

  async oembed(url: string) {
    let response: Response;
    try {
      response = await fetch(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new UpstreamError('PINTEREST_UNAVAILABLE', 'Pinterest did not answer. Try again in a moment.');
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new UpstreamError('PINTEREST_UNAVAILABLE', 'Pinterest did not answer. Try again in a moment.');
    const body = (await response.json().catch(() => null)) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    } | null;
    if (!body) return null;
    return { title: body.title?.trim() || null, author: body.author_name?.trim() || null, imageUrl: body.thumbnail_url ?? null };
  }

  async boards(): Promise<PinterestBoardDto[]> {
    const body = await this.api<{
      items: { id: string; name: string; pin_count?: number; media?: { image_cover_url?: string } }[];
    }>('/v5/boards?page_size=50');
    return body.items.map((b) => ({ id: b.id, name: b.name, pinCount: b.pin_count ?? null, coverUrl: b.media?.image_cover_url ?? null }));
  }

  async boardPins(boardId: string): Promise<PinterestPinDto[]> {
    const body = await this.api<{ items: ApiPin[] }>(`/v5/boards/${encodeURIComponent(boardId)}/pins?page_size=50`);
    return body.items.map((p) => {
      const images = p.media?.images ?? {};
      const best = images['600x'] ?? images['400x300'] ?? images['originals'] ?? Object.values(images)[0];
      return { id: p.id, title: p.title?.trim() || null, url: `https://www.pinterest.com/pin/${p.id}/`, imageUrl: best?.url ?? null };
    });
  }

  private async api<T>(path: string): Promise<T> {
    if (!this.token) throw new UpstreamError('PINTEREST_NOT_CONNECTED', 'Pinterest is not connected.');
    let response: Response;
    try {
      response = await fetch(`https://api.pinterest.com${path}`, {
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new UpstreamError('PINTEREST_UNAVAILABLE', 'Pinterest did not answer. Try again in a moment.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new UpstreamError('PINTEREST_NOT_CONNECTED', 'The Pinterest connection has expired. Ask the admin to renew the token.');
    }
    if (!response.ok) throw new UpstreamError('PINTEREST_UNAVAILABLE', 'Pinterest did not answer. Try again in a moment.');
    return (await response.json()) as T;
  }
}
