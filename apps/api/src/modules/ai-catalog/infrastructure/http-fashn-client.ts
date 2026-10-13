import {
  FashnRequestError,
  type FashnClient,
  type FashnStatus,
} from '../application/ports/catalog.ports';

const BASE_URL = 'https://api.fashn.ai/v1';
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** Results come only from FASHN's CDN; nothing else is downloaded with the server's network. */
const OUTPUT_HOSTS = /^https:\/\/(cdn|media)\.fashn\.ai\//;

interface StatusBody {
  id: string;
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
  output?: string[] | null;
  error?: { name?: string; message?: string } | string | null;
}

/** FASHN REST API (docs.fashn.ai): POST /run, GET /status/{id}, GET /credits. The key stays here. */
export class HttpFashnClient implements FashnClient {
  readonly live = true;

  constructor(private readonly apiKey: string) {}

  async run(endpoint: string, inputs: Record<string, unknown>): Promise<{ id: string }> {
    const res = await this.request('/run', {
      method: 'POST',
      body: JSON.stringify({ model_name: endpoint, inputs }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: unknown };
    if (!body.id) throw new FashnRequestError('server', 'FASHN returned no prediction id');
    return { id: body.id };
  }

  async status(id: string): Promise<FashnStatus> {
    const res = await this.request(`/status/${encodeURIComponent(id)}`, { method: 'GET' });
    const body = (await res.json()) as StatusBody;
    if (body.status === 'completed') {
      const used = Number(res.headers.get('x-fashn-credits-used'));
      return {
        state: 'completed',
        output: body.output ?? [],
        creditsUsed: Number.isFinite(used) && used > 0 ? used : null,
      };
    }
    if (body.status === 'failed') {
      const error =
        typeof body.error === 'object' && body.error
          ? body.error
          : { name: 'PipelineError', message: String(body.error ?? '') };
      return {
        state: 'failed',
        errorName: error.name ?? 'PipelineError',
        message: error.message ?? '',
      };
    }
    return { state: 'pending' };
  }

  async download(url: string) {
    if (!OUTPUT_HOSTS.test(url))
      throw new FashnRequestError('invalid', 'Unexpected result address');
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    } catch {
      throw new FashnRequestError('network', 'Could not download the result');
    }
    if (!res.ok) throw new FashnRequestError('server', `Result download failed (${res.status})`);
    const contentType = res.headers.get('content-type')?.includes('jpeg')
      ? 'image/jpeg'
      : 'image/png';
    return { data: Buffer.from(await res.arrayBuffer()), contentType } as const;
  }

  async credits(): Promise<number | null> {
    try {
      const res = await this.request('/credits', { method: 'GET' });
      const body = (await res.json()) as { credits?: { total?: number } };
      return typeof body.credits?.total === 'number' ? body.credits.total : null;
    } catch {
      return null;
    }
  }

  private async request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new FashnRequestError('network', 'FASHN could not be reached');
    }
    if (res.ok) return res;
    const body = (await res.json().catch(() => ({}))) as { error?: string | { name?: string } };
    const name = typeof body.error === 'string' ? body.error : (body.error?.name ?? '');
    if (res.status === 401) throw new FashnRequestError('auth', 'UnauthorizedAccess');
    if (res.status === 429)
      throw new FashnRequestError(
        /credit/i.test(name) ? 'credits' : 'rate',
        name || 'RateLimitExceeded',
      );
    if (res.status === 400 || res.status === 404)
      throw new FashnRequestError('invalid', name || 'BadRequest');
    throw new FashnRequestError('server', name || `HTTP ${res.status}`);
  }
}
