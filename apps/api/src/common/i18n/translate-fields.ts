import { SetMetadata } from '@nestjs/common';

export const TRANSLATE_FIELDS = 'translate-fields';

/**
 * The response fields (at any depth) to show in the visitor's language when the request asks for
 * one (`?lang=ar`): catalog text only (design and collection names, descriptions, fabric names…),
 * never people's names or anything they typed. See the catalog module's translation interceptor.
 */
export const TranslateFields = (...keys: string[]) => SetMetadata(TRANSLATE_FIELDS, keys);
