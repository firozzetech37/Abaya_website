import { Inject, Injectable } from '@nestjs/common';
import type { AdminAnnouncementDto, AnnouncementDto, TranslationDto } from '@abaya/contracts';
import { BusinessRuleError, NotFoundError } from '../../../common/errors/domain-error';
import {
  ANNOUNCEMENT_REPOSITORY,
  type AnnouncementInput,
  type AnnouncementRecord,
  type AnnouncementRepository,
  TRANSLATOR,
  type Translator,
} from './ports/catalog.ports';

type Body = {
  textEn?: string;
  textAr?: string;
  linkPath?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
};

/** Shown while active and inside its dates (either date may be open). */
export const isLive = (a: Pick<AnnouncementRecord, 'isActive' | 'startsAt' | 'endsAt'>, now: Date): boolean =>
  a.isActive && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now);

/** The website's top-bar messages: CATALOG_MANAGER writes them, the website reads the live ones in its language. */
@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(ANNOUNCEMENT_REPOSITORY) private readonly repo: AnnouncementRepository,
    @Inject(TRANSLATOR) private readonly translator: Translator,
  ) {}

  /** An Arabic draft of an English message, for the editor to check before saving. */
  async translate(text: string): Promise<TranslationDto> {
    try {
      return { textAr: await this.translator.toArabic(text), provider: this.translator.provider };
    } catch {
      throw new BusinessRuleError('TRANSLATION_UNAVAILABLE', 'The translation service did not answer. Please write the Arabic yourself or try again.');
    }
  }

  async live(locale: 'en' | 'ar', now = new Date()): Promise<AnnouncementDto[]> {
    return (await this.repo.list())
      .filter((a) => isLive(a, now))
      .map((a) => ({ id: a.id, text: locale === 'ar' ? a.textAr : a.textEn, linkPath: a.linkPath }));
  }

  async list(now = new Date()): Promise<AdminAnnouncementDto[]> {
    return (await this.repo.list()).map((a) => this.toDto(a, now));
  }

  async create(body: Body & { textEn: string; textAr: string }): Promise<AdminAnnouncementDto> {
    const { startsAt: _s, endsAt: _e, ...rest } = body;
    return this.toDto(await this.repo.create({ ...rest, ...toDates(body) }), new Date());
  }

  async update(id: string, body: Body): Promise<AdminAnnouncementDto> {
    const { startsAt: _s, endsAt: _e, ...rest } = body;
    const updated = await this.repo.update(id, { ...rest, ...toDates(body) });
    if (!updated) throw new NotFoundError('Announcement');
    return this.toDto(updated, new Date());
  }

  async delete(id: string): Promise<void> {
    if (!(await this.repo.delete(id))) throw new NotFoundError('Announcement');
  }

  private toDto(a: AnnouncementRecord, now: Date): AdminAnnouncementDto {
    return {
      id: a.id,
      textEn: a.textEn,
      textAr: a.textAr,
      linkPath: a.linkPath,
      isActive: a.isActive,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      sortOrder: a.sortOrder,
      live: isLive(a, now),
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}

function toDates(body: Body): Pick<AnnouncementInput, 'startsAt' | 'endsAt'> {
  const out: Pick<AnnouncementInput, 'startsAt' | 'endsAt'> = {};
  if (body.startsAt !== undefined) out.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) out.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  return out;
}
