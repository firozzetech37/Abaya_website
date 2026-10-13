import { describe, expect, it } from 'vitest';
import { buildGenerationPrompt, generationBody, isPinterestUrl, promptProblems } from './studio';

describe('studio prompt filter', () => {
  it('lets ordinary design notes through', () => {
    expect(promptProblems('Flowing A-line with pearl work on the cuffs and a soft collar')).toEqual([]);
    expect(promptProblems('Pleated back, deep green, gold thread on the hem')).toEqual([]);
  });

  it('blocks brands, real people, copying and links', () => {
    expect(promptProblems('Something like Chanel tweed')).toEqual(['brand']);
    expect(promptProblems('as worn by a celebrity at the awards')).toEqual(['person']);
    expect(promptProblems('Make an exact copy of this abaya')).toEqual(['copy']);
    expect(promptProblems('see https://pin.it/abc for the look')).toEqual(['link']);
    // Brand words only match whole words ("lv" inside "silver" is fine).
    expect(promptProblems('Silver embroidery on navy crepe')).toEqual([]);
  });

  it('builds the model prompt from the choices and notes', () => {
    const body = generationBody.parse({ style: 'OPEN_FRONT', fabric: 'Crepe', embroidery: 'None', prompt: 'Soft belt at the waist' });
    const text = buildGenerationPrompt(body, 'Open front', false);
    expect(text).toContain('open front abaya');
    expect(text).toContain('Fabric: Crepe');
    expect(text).not.toContain('Embellishment');
    expect(text).toContain('Designer notes: Soft belt at the waist');
    expect(buildGenerationPrompt(body, 'Open front', true)).toContain('attached sketch');
  });

  it('recognises Pinterest pin links only', () => {
    expect(isPinterestUrl('https://www.pinterest.com/pin/123456789/')).toBe(true);
    expect(isPinterestUrl('https://in.pinterest.com/pin/123456789/')).toBe(true);
    expect(isPinterestUrl('https://pin.it/3xYz')).toBe(true);
    expect(isPinterestUrl('https://example.com/pin/1')).toBe(false);
    expect(isPinterestUrl('https://www.pinterest.com/someone/boards/')).toBe(false);
  });
});
