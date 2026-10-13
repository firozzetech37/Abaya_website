/** "eid, Lace ,everyday" → ["eid", "lace", "everyday"] (unique, trimmed, lowercase). */
export function parseTags(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export const tagsToText = (tags: readonly string[]): string => tags.join(', ');
