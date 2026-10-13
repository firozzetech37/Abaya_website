import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { ImageGenerator } from '../application/ports/studio.ports';

/** Rough colours for the placeholder (unknown names fall back to black). */
const COLOURS: Record<string, string> = {
  black: '#1c1a19',
  navy: '#1f2a44',
  emerald: '#1f5c4a',
  maroon: '#5c1f2a',
  beige: '#cdb79e',
  'dusty rose': '#c49a9a',
  olive: '#5f6136',
  grey: '#6f6f6f',
};

/**
 * Placeholder images while no image model key is set (AI_IMAGE_PROVIDER=test): an abaya
 * silhouette in the chosen colour, clearly marked "Test image". Lets the whole Studio flow
 * be tried without paying for a model.
 */
@Injectable()
export class TestImageGenerator implements ImageGenerator {
  readonly provider = 'test';
  readonly model = 'test-placeholder';
  readonly live = false;

  async generate(request: Parameters<ImageGenerator['generate']>[0]) {
    const fill = COLOURS[(request.colour ?? '').toLowerCase()] ?? '#1c1a19';
    const flare = 30 + request.variation * 18;
    const sleeve = 60 + request.variation * 10;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <rect width="768" height="1024" fill="#f3ece2"/>
  <path d="M384 70 a150 150 0 0 1 150 150 v24 H234 v-24 a150 150 0 0 1 150 -150 z" fill="none" stroke="#c9a96e" stroke-width="3"/>
  <circle cx="384" cy="150" r="42" fill="#d9cbb8"/>
  <path d="M330 200 L438 200 L${470 + sleeve} 470 L${452 + sleeve} 480 L460 290 L${520 + flare} 940 L${248 - flare} 940 L308 290 L${316 - sleeve} 480 L${298 - sleeve} 470 Z" fill="${fill}"/>
  <line x1="384" y1="210" x2="384" y2="940" stroke="#c9a96e" stroke-width="2" opacity="0.6"/>
  <text x="384" y="995" font-family="Georgia, serif" font-size="30" fill="#8a7a66" text-anchor="middle">Test image · variation ${request.variation}</text>
</svg>`;
    const data = await sharp(Buffer.from(svg)).png().toBuffer();
    return { data, mimeType: 'image/png' } as const;
  }
}
