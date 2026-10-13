import type { AiInsightsDto, AiSimilarItem } from '@abaya/contracts';
import type { Actor } from '../../../common/auth/auth.types';
import type { AiInsights, ImageSource } from '../../ai/application/ai.service';
import { ReferenceRules } from '../domain/reference.entity';
import { primaryImage } from './catalog-query.service';
import { toEntity } from './design-entity';
import type { CatalogImageStorage, DesignRepository, ReferenceRepository } from './ports/catalog.ports';

/** Seed images live in the public bucket; uploads stay in the private bucket (a public copy is made on publish). */
export const designImageSource = (storagePath: string): ImageSource =>
  storagePath.startsWith('seed/') ? { bucket: 'public', path: storagePath } : { bucket: 'private', path: storagePath };

export const referenceImageSource = (imagePath: string): ImageSource =>
  /^https?:\/\//i.test(imagePath) ? { url: imagePath } : { bucket: 'private', path: imagePath };

/**
 * The AI panel for one design or reference. Look-alikes the viewer may not open
 * (another designer's design, a reference not assigned to them) are shown without
 * name or picture, so the warning still reaches the reviewer without leaking work.
 */
export async function toInsightsDto(
  actor: Actor,
  insights: AiInsights,
  deps: { designs: DesignRepository; references: ReferenceRepository; images: CatalogImageStorage },
  ownReferenceId: string | null,
): Promise<AiInsightsDto> {
  const designIds = insights.matches.filter((m) => m.owner.kind === 'DESIGN').map((m) => m.owner.id);
  const referenceIds = insights.matches.filter((m) => m.owner.kind === 'REFERENCE').map((m) => m.owner.id);
  const [designs, references] = await Promise.all([deps.designs.findManyByIds(designIds), deps.references.findManyByIds(referenceIds)]);
  const designById = new Map(designs.map((d) => [d.id, d]));
  const referenceById = new Map(references.map((r) => [r.id, r]));

  const similar: AiSimilarItem[] = [];
  for (const m of insights.matches) {
    const base = { id: m.owner.id, score: m.score, level: m.level };
    if (m.owner.kind === 'DESIGN') {
      const d = designById.get(m.owner.id);
      if (!d) continue; // deleted since it was analysed
      const visible = toEntity(d).canView(actor);
      const image = primaryImage(d);
      similar.push({
        ...base,
        kind: 'DESIGN',
        name: visible ? d.name : null,
        status: visible ? d.status : null,
        imageUrl: visible && image ? await deps.images.adminUrl(image.storagePath) : null,
        isOwnReference: false,
      });
    } else {
      const r = referenceById.get(m.owner.id);
      if (!r) continue;
      const visible = ReferenceRules.canView(actor, r.assignedDesigner?.id ?? null);
      similar.push({
        ...base,
        kind: 'REFERENCE',
        name: visible ? (r.title ?? null) : null,
        status: visible ? r.status : null,
        imageUrl: visible ? await deps.images.referenceUrl(r.imagePath) : null,
        isOwnReference: r.id === ownReferenceId,
      });
    }
  }

  return {
    status: insights.status,
    analysedImages: insights.analysedImages,
    totalImages: insights.totalImages,
    suggestion: insights.suggestion,
    similar,
    hasDuplicate: similar.some((s) => s.level === 'DUPLICATE'),
  };
}
