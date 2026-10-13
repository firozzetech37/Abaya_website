import type { OrderDetailDto, OrderItemDto, OrderSummaryDto, ProductionStage } from '@abaya/contracts';
import { headlineStage } from '../domain/order.rules';
import type { OrderItemRecord, OrderMedia, OrderRecord } from './ports/orders.ports';

/**
 * Stage notes customers may read: tracking numbers and the reasons for a cancellation or
 * remake. Workshop notes (pattern versions, QC findings, hold questions) stay internal.
 */
const CUSTOMER_NOTE_STAGES = new Set<ProductionStage>(['SHIPPED', 'CANCELLED', 'REMAKE']);

/** Maps order records to the DTOs in @abaya/contracts. Photo URLs are short-lived signed URLs. */
export async function toItemDto(
  item: OrderItemRecord,
  media: OrderMedia,
  audience: 'staff' | 'customer' = 'staff',
): Promise<OrderItemDto> {
  return {
    id: item.id,
    design: {
      id: item.designId,
      name: item.designSnapshot.name,
      slug: item.designSnapshot.slug,
      style: item.designSnapshot.style as OrderItemDto['design']['style'],
      primaryImageUrl: media.designImageUrl(item.designSnapshot.primaryImagePath),
    },
    options: item.optionsSnapshot,
    sizeBandCode: item.sizeBandCode,
    measurements: item.measurementsSnapshot,
    priceBreakdown: item.priceBreakdown,
    unitPriceInPaise: item.unitPriceInPaise,
    quantity: item.quantity,
    stage: item.stage,
    // Staff only: the customer's own copy disappears after an hour, and try-ons are never kept.
    aiPreview:
      audience === 'staff' && item.aiPreviewPath
        ? { url: await media.stagePhotoUrl(item.aiPreviewPath), inspirationOnly: item.aiPreviewInspiration }
        : null,
    stageEvents: await Promise.all(
      item.stageEvents.map(async (e) => ({
        id: e.id,
        fromStage: e.fromStage,
        toStage: e.toStage,
        note: audience === 'staff' || CUSTOMER_NOTE_STAGES.has(e.toStage) ? e.note : null,
        photoUrl: e.photoPath ? await media.stagePhotoUrl(e.photoPath) : null,
        createdAt: e.createdAt.toISOString(),
      })),
    ),
  };
}

export function toSummaryDto(order: OrderRecord, media: OrderMedia): OrderSummaryDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalInPaise: order.totalInPaise,
    itemCount: order.items.length,
    headlineStage: headlineStage(order.items.map((i) => i.stage)),
    primaryImageUrl: media.designImageUrl(order.items[0]?.designSnapshot.primaryImagePath ?? null),
    placedAt: order.placedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

export async function toDetailDto(order: OrderRecord, media: OrderMedia): Promise<OrderDetailDto> {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotalInPaise: order.subtotalInPaise,
    shippingInPaise: order.shippingInPaise,
    discountInPaise: order.discountInPaise,
    totalInPaise: order.totalInPaise,
    shippingAddress: order.shippingAddress,
    customerNote: order.customerNote,
    placedAt: order.placedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    items: await Promise.all(order.items.map((i) => toItemDto(i, media, 'customer'))),
    shipments: order.shipments.map((s) => ({
      ...s,
      shippedAt: s.shippedAt?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
    })),
  };
}
