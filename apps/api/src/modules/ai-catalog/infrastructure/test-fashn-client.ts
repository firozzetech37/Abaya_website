import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { FashnClient, FashnStatus } from '../application/ports/catalog.ports';

const SIZES: Record<string, [number, number]> = {
  '1k': [800, 1000],
  '2k': [1600, 2000],
  '4k': [3200, 4000],
};

/**
 * Free stand-in while FASHN_API_KEY is not set: every request "completes" at once with
 * placeholder images marked "Test image", so the whole AI Catalog flow can be tried.
 */
export class TestFashnClient implements FashnClient {
  readonly live = false;
  private readonly runs = new Map<string, { endpoint: string; inputs: Record<string, unknown> }>();

  async run(endpoint: string, inputs: Record<string, unknown>) {
    const id = `test_${randomUUID()}`;
    this.runs.set(id, { endpoint, inputs });
    return { id };
  }

  async status(id: string): Promise<FashnStatus> {
    const run = this.runs.get(id);
    if (!run) return { state: 'failed', errorName: 'PipelineError', message: 'unknown test job' };
    this.runs.delete(id);
    const count = Number(run.inputs.num_images ?? 1);
    const [w, h] = SIZES[String(run.inputs.resolution ?? '1k')] ?? SIZES['1k']!;
    const output: string[] = [];
    for (let i = 0; i < count; i++) {
      // Small placeholder, labelled with what was asked for (real size noted in the label).
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">
  <rect width="400" height="500" fill="#efe7dc"/>
  <path d="M200 70 L240 90 L300 450 L100 450 L160 90 Z" fill="#26221f"/>
  <circle cx="200" cy="60" r="26" fill="#cbb8a1"/>
  <text x="200" y="478" font-family="Georgia, serif" font-size="15" fill="#7a6a58" text-anchor="middle">Test image · ${run.endpoint} · ${w}×${h} · ${i + 1}</text>
</svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      output.push(`data:image/png;base64,${png.toString('base64')}`);
    }
    return { state: 'completed', output, creditsUsed: null } as const;
  }

  async download(url: string) {
    const match = /^data:image\/png;base64,(.+)$/.exec(url);
    if (!match) throw new Error('Test results are data URIs');
    return { data: Buffer.from(match[1]!, 'base64'), contentType: 'image/png' } as const;
  }

  async credits() {
    return null;
  }
}
