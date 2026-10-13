import type { MeasurementBody } from '@abaya/contracts';
import type { MeasurementValues } from '../../domain/customer.rules';

export interface MeasurementProfileRecord extends MeasurementValues {
  id: string;
  userId: string;
  name: string;
  notes: string | null;
  source: 'MANUAL' | 'PHOTO_SCAN';
  isDefault: boolean;
  updatedAt: Date;
}

export interface MeasurementRepository {
  listForUser(userId: string): Promise<MeasurementProfileRecord[]>;
  findForUser(userId: string, id: string): Promise<MeasurementProfileRecord | null>;
  countForUser(userId: string): Promise<number>;
  create(userId: string, input: MeasurementBody): Promise<MeasurementProfileRecord>;
  update(userId: string, id: string, input: Partial<MeasurementBody>): Promise<MeasurementProfileRecord>;
  delete(userId: string, id: string): Promise<void>;
}

export interface CartItemRecord {
  id: string;
  designId: string;
  selectedOptionValueIds: string[];
  sizeBandId: string | null;
  measurementProfileId: string | null;
  measurementProfileName: string | null;
  quantity: number;
  /** Private copy of her matching AI preview (for the workshop); never shown back to her. */
  aiPreviewPath: string | null;
  aiPreviewInspiration: boolean;
  createdAt: Date;
}

export interface CartRepository {
  listItems(userId: string): Promise<CartItemRecord[]>;
  findItem(userId: string, itemId: string): Promise<CartItemRecord | null>;
  addItem(
    userId: string,
    item: {
      designId: string;
      selectedOptionValueIds: string[];
      sizeBandId: string | null;
      measurementProfileId: string | null;
      quantity: number;
      aiPreviewPath?: string | null;
      aiPreviewInspiration?: boolean;
    },
  ): Promise<CartItemRecord>;
  /** Attach (or replace) the AI preview copy of an item. */
  setAiPreview(userId: string, itemId: string, preview: { path: string; inspirationOnly: boolean }): Promise<void>;
  updateQuantity(userId: string, itemId: string, quantity: number): Promise<CartItemRecord>;
  removeItem(userId: string, itemId: string): Promise<void>;
  removeItems(userId: string, itemIds: string[]): Promise<void>;
}

export interface WishlistRecord {
  designId: string;
  createdAt: Date;
}

export interface WishlistRepository {
  list(userId: string): Promise<WishlistRecord[]>;
  count(userId: string): Promise<number>;
  add(userId: string, designId: string): Promise<void>;
  remove(userId: string, designId: string): Promise<void>;
}

/** DPDP: everything the customer module holds about one person. */
export interface CustomerDataRepository {
  exportForUser(userId: string): Promise<Record<string, unknown>>;
  deleteForUser(userId: string): Promise<void>;
}

export const MEASUREMENT_REPOSITORY = Symbol('MEASUREMENT_REPOSITORY');
export const CART_REPOSITORY = Symbol('CART_REPOSITORY');
export const WISHLIST_REPOSITORY = Symbol('WISHLIST_REPOSITORY');
export const CUSTOMER_DATA_REPOSITORY = Symbol('CUSTOMER_DATA_REPOSITORY');
