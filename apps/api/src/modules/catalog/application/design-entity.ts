import { Design } from '../domain/design.entity';
import type { DesignRecord } from './ports/catalog.ports';

/** Rebuild the Design aggregate from a stored record (status rules, role checks). */
export const toEntity = (d: DesignRecord) =>
  Design.fromProps({
    id: d.id,
    name: d.name,
    style: d.style,
    status: d.status,
    designerId: d.designerId,
    basePriceInPaise: d.basePriceInPaise,
    reviewNotes: d.reviewNotes,
    publishedAt: d.publishedAt,
    archivedAt: d.archivedAt,
  });
