/**
 * The visible watermark on website AI previews and try-ons (never on catalog photos): a faint
 * diagonal line of text repeated across the whole picture, so it cannot be cropped away, and a
 * small badge with the brand's arch in the bottom corner. Drawn as an SVG that is laid over the
 * picture before the invisible mark is added. Plain TypeScript (no image library).
 */

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

const SERIF = "Georgia, 'Times New Roman', 'DejaVu Serif', serif";

export interface VisibleMarkText {
  /** Repeated diagonally, e.g. "Abaya Atelier · AI preview". */
  pattern: string;
  /** In the corner badge, e.g. "Abaya Atelier". */
  brand: string;
  /** Under the brand in the badge, e.g. "AI PREVIEW". */
  caption: string;
}

/** An SVG the size of the picture with the diagonal pattern and the corner badge. */
export function visibleMarkSvg(width: number, height: number, text: VisibleMarkText): string {
  const unit = Math.max(width, height);
  const fontSize = Math.max(12, Math.round(width / 26));
  const rowGap = fontSize * 4.2;
  const pattern = escapeXml(text.pattern);
  // Rows of repeated text, drawn on a square larger than the picture and turned -30°, so the
  // pattern reaches every corner whatever the shape.
  const span = unit * 1.6;
  const repeat = `${pattern}   ·   ${pattern}   ·   ${pattern}   ·   ${pattern}   ·   ${pattern}`;
  const rows: string[] = [];
  let i = 0;
  for (let y = -span / 2; y <= span / 2; y += rowGap, i++) {
    // Alternate rows are shifted, like brickwork, so the lines do not stack into columns.
    const x = -span / 2 - (i % 2) * fontSize * 6;
    rows.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${repeat}</text>`);
  }

  // Corner badge: the arch from the brand mark, the name, and what the picture is.
  const pad = Math.round(width * 0.03);
  const badgeH = Math.max(34, Math.round(width * 0.085));
  const brandSize = Math.round(badgeH * 0.36);
  const captionSize = Math.max(8, Math.round(badgeH * 0.2));
  const archH = Math.round(badgeH * 0.62);
  const archW = Math.round(archH * 0.8);
  const textW = Math.max(text.brand.length * brandSize * 0.52, text.caption.length * captionSize * 0.62);
  const badgeW = Math.round(archW + textW + badgeH * 0.75);
  const bx = width - pad - badgeW;
  const by = height - pad - badgeH;
  const ax = bx + badgeH * 0.28;
  const ay = by + (badgeH - archH) / 2;
  const tx = ax + archW + badgeH * 0.22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g transform="translate(${(width / 2).toFixed(1)} ${(height / 2).toFixed(1)}) rotate(-30)" font-family="${SERIF}" font-size="${fontSize}" letter-spacing="${(fontSize * 0.12).toFixed(1)}"
     fill="#FFFFFF" fill-opacity="0.2" stroke="#231C17" stroke-opacity="0.13" stroke-width="${Math.max(0.6, fontSize / 26).toFixed(2)}">
    ${rows.join('\n    ')}
  </g>
  <g>
    <rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="#2E0D14" fill-opacity="0.62" stroke="#DDBB6B" stroke-opacity="0.55" stroke-width="1"/>
    <g transform="translate(${ax.toFixed(1)} ${ay.toFixed(1)}) scale(${(archH / 40).toFixed(4)})" fill="none" stroke="#DDBB6B">
      <path d="M2.5 39V16.5a13.5 13.5 0 0 1 27 0V39" stroke-width="2.2"/>
      <path d="M8 39V18a8 8 0 0 1 16 0v21" stroke-width="1.6" stroke-opacity="0.6"/>
    </g>
    <text x="${tx.toFixed(1)}" y="${(by + badgeH * 0.5).toFixed(1)}" font-family="${SERIF}" font-size="${brandSize}" fill="#FBF6E9">${escapeXml(text.brand)}</text>
    <text x="${tx.toFixed(1)}" y="${(by + badgeH * 0.78).toFixed(1)}" font-family="${SERIF}" font-size="${captionSize}" letter-spacing="${(captionSize * 0.18).toFixed(1)}" fill="#EBD59C">${escapeXml(text.caption)}</text>
  </g>
</svg>`;
}

/** What the visible mark says on each kind of AI picture. */
export const VISIBLE_MARK_TEXT = {
  PREVIEW: { pattern: 'Abaya Atelier · AI preview', brand: 'Abaya Atelier', caption: 'AI PREVIEW' },
  TRYON: { pattern: 'Abaya Atelier · AI try-on', brand: 'Abaya Atelier', caption: 'AI TRY-ON' },
} satisfies Record<string, VisibleMarkText>;
