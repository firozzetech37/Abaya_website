import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiPreviewChecker, parseAnswers, pauseAfter, retryDelayMs } from './gemini-preview-checker';

describe('Gemini preview checker', () => {
  it('reads the checker’s JSON answer, or gives up on anything else', () => {
    expect(parseAnswers('{"results":[{"n":1,"ok":true,"problem":""},{"n":2,"ok":false,"problem":"x"}]}', 2)).toEqual([
      { ok: true, problem: '' },
      { ok: false, problem: 'x' },
    ]);
    expect(parseAnswers('```json\n{"results":[{"n":1,"ok":true}]}\n```', 1)).toEqual([{ ok: true, problem: '' }]);
    expect(parseAnswers('{"results":[{"n":1,"ok":true}]}', 2)).toBeNull();
    expect(parseAnswers('not json', 1)).toBeNull();
  });
});

describe('Gemini refusals', () => {
  it('reads when Gemini says to come back', () => {
    expect(retryDelayMs('{"retryDelay": "69000s"}')).toBe(69_000_000);
    expect(retryDelayMs('Please retry in 19h10m0.1s.')).toBe(69_000_100);
    expect(retryDelayMs('Please retry in 37.5s.')).toBe(37_500);
    expect(retryDelayMs('no hint')).toBeNull();
  });

  it('stops asking for at most an hour after "quota used up", 10 minutes after "overloaded", never otherwise', () => {
    expect(pauseAfter(429, '{"retryDelay": "69000s"}')).toBe(60 * 60_000);
    expect(pauseAfter(429, '{"retryDelay": "5s"}')).toBe(30_000);
    expect(pauseAfter(429, '{"retryDelay": "120s"}')).toBe(120_000);
    expect(pauseAfter(429, '')).toBe(10 * 60_000);
    expect(pauseAfter(503, '')).toBe(10 * 60_000);
    expect(pauseAfter(400, '')).toBe(0);
    expect(pauseAfter(500, '')).toBe(0);
  });
});

describe('Gemini that does not answer in time', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives up, and skips Gemini for the next 10 minutes instead of making every customer wait again', async () => {
    const fetch = vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    vi.stubGlobal('fetch', fetch);
    const gemini = new GeminiPreviewChecker('key', 'model');
    expect(await gemini.classifyRequest('a beach')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await gemini.classifyRequest('a garden')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
