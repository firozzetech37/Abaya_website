import { describe, expect, it } from 'vitest';
import {
  fashnInputs,
  friendlyError,
  isTemporaryFailure,
  stageLabel,
  startOfIndiaDay,
} from './catalog.rules';

const base = {
  prompt: 'p',
  resolution: '2k',
  mode: 'balanced',
  numImages: 2,
  seed: 7,
  aspectRatio: null,
} as const;

describe('FASHN request building', () => {
  it('maps each job to its endpoint inputs', () => {
    expect(
      fashnInputs({ ...base, kind: 'TRYON', view: 'MASTER' }, { abaya: 'A', model: 'M' }),
    ).toEqual({
      product_image: 'A',
      model_image: 'M',
      prompt: 'p',
      resolution: '2k',
      generation_mode: 'balanced',
      num_images: 2,
      seed: 7,
      output_format: 'png',
    });
    expect(fashnInputs({ ...base, kind: 'MODEL_CREATE', view: 'MODEL' }, {})).toMatchObject({
      prompt: 'p',
      aspect_ratio: '4:5',
    });
    expect(
      fashnInputs({ ...base, kind: 'BACKGROUND_REMOVE', view: 'CLEANUP' }, { source: 'S' }),
    ).toEqual({ image: 'S' });
  });

  it('sends product-to-model with the face and background photos only when given', () => {
    const plain = fashnInputs(
      { ...base, kind: 'PRODUCT_TO_MODEL', view: 'MASTER' },
      { abaya: 'A' },
    );
    expect(plain).toMatchObject({
      product_image: 'A',
      prompt: 'p',
      aspect_ratio: '4:5',
      resolution: '2k',
    });
    expect(plain).not.toHaveProperty('face_reference');
    expect(plain).not.toHaveProperty('background_reference');
    expect(
      fashnInputs(
        { ...base, kind: 'PRODUCT_TO_MODEL', view: 'MASTER' },
        { abaya: 'A', face: 'F', background: 'B' },
      ),
    ).toMatchObject({
      face_reference: 'F',
      face_reference_mode: 'match_reference',
      background_reference: 'B',
    });
  });

  it('sends the back photo only for back views, and the mask for edits', () => {
    const back = fashnInputs({ ...base, kind: 'EDIT', view: 'BACK' }, { source: 'S', back: 'B' });
    expect(back).toMatchObject({ image: 'S', image_context: 'B' });
    const side = fashnInputs({ ...base, kind: 'EDIT', view: 'SIDE' }, { source: 'S', back: 'B' });
    expect(side).not.toHaveProperty('image_context');
    expect(
      fashnInputs({ ...base, kind: 'EDIT', view: 'EDIT' }, { source: 'S', mask: 'K' }),
    ).toMatchObject({ mask: 'K' });
    expect(() => fashnInputs({ ...base, kind: 'TRYON', view: 'MASTER' }, { abaya: 'A' })).toThrow(
      /model/,
    );
  });
});

describe('labels and errors', () => {
  it('describes what is happening', () => {
    expect(stageLabel({ status: 'RUNNING', view: 'THREE_QUARTER', resolution: '2k' })).toBe(
      'Generating three-quarter pose…',
    );
    expect(stageLabel({ status: 'RUNNING', view: 'MASTER', resolution: '4k' })).toBe(
      'Generating final 4K…',
    );
    expect(stageLabel({ status: 'QUEUED', view: 'MASTER', resolution: '2k' })).toBe(
      'Waiting for a free slot…',
    );
  });

  it('retries only temporary failures and never shows raw errors', () => {
    expect(isTemporaryFailure('UnavailableError')).toBe(true);
    expect(isTemporaryFailure('ContentModerationError')).toBe(false);
    expect(friendlyError('ImageLoadError')).toMatch(/could not read/);
    expect(friendlyError('Weird')).toBe('The image could not be made. Please try again.');
  });

  it('starts the day at midnight India time', () => {
    expect(startOfIndiaDay(new Date('2026-10-08T20:00:00Z')).toISOString()).toBe(
      '2026-10-08T18:30:00.000Z',
    );
  });
});
