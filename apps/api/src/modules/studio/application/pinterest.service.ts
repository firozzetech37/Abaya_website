import { Inject, Injectable } from '@nestjs/common';
import { isPinterestUrl, type PinPreviewDto, type PinterestBoardDto, type PinterestPinDto, type ReferenceDto } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import { BusinessRuleError } from '../../../common/errors/domain-error';
import { ReferencesService } from '../../catalog/application/references.service';
import { pinIdFromUrl } from '../domain/studio.rules';
import { PINTEREST_CLIENT, type PinterestClient } from './ports/studio.ports';

/**
 * Pinterest for inspiration only: pins are shown from Pinterest (official oEmbed / API) with a
 * link back. A pin image is never downloaded, stored or sent to the AI; a saved pin keeps the
 * link and Pinterest's own image address.
 */
@Injectable()
export class PinterestService {
  constructor(
    @Inject(PINTEREST_CLIENT) private readonly client: PinterestClient,
    private readonly references: ReferencesService,
  ) {}

  get connected(): boolean {
    return this.client.connected;
  }

  async preview(url: string): Promise<PinPreviewDto> {
    if (!isPinterestUrl(url)) throw new BusinessRuleError('INVALID_PIN_URL', 'Paste a Pinterest pin link (pinterest.com/pin/… or pin.it/…).');
    const canonical = await this.client.canonicalUrl(url);
    const pin = await this.client.oembed(canonical);
    if (!pin) throw new BusinessRuleError('PIN_NOT_FOUND', 'Pinterest did not return this pin. Check the link is public.');
    return { url: canonical, title: pin.title, author: pin.author, imageUrl: pin.imageUrl, providerUrl: 'https://www.pinterest.com' };
  }

  async save(actor: Actor, url: string, note?: string): Promise<ReferenceDto> {
    const pin = await this.preview(url);
    const pinId = pinIdFromUrl(pin.url);
    if (!pinId || !pin.imageUrl) throw new BusinessRuleError('PIN_NOT_FOUND', 'This pin cannot be saved. Try opening it on Pinterest first.');
    return this.references.savePin(actor, { pinId, url: pin.url, imageUrl: pin.imageUrl, title: pin.title, note: note?.trim() || null });
  }

  async boards(): Promise<{ connected: boolean; boards: PinterestBoardDto[] }> {
    if (!this.client.connected) return { connected: false, boards: [] };
    return { connected: true, boards: await this.client.boards() };
  }

  async boardPins(boardId: string): Promise<PinterestPinDto[]> {
    if (!this.client.connected) return [];
    return this.client.boardPins(boardId);
  }
}
