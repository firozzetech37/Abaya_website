'use client';

/**
 * iPhone photos are HEIC by default. Most browsers cannot show them and our image pipeline
 * cannot read them, so a HEIC photo is turned into a JPEG here, in the browser, as soon as it is
 * chosen (the preview and the upload then work as for any photo). The converter (libheif, about
 * 3 MB) is only downloaded when a HEIC photo is actually picked.
 */

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
/** Longest side of the converted photo: plenty for a try-on, and keeps it well under 10 MB. */
const MAX_SIDE = 3000;
const QUALITY = 0.9;

/** Some browsers give HEIC files no type at all, so the file name counts too. */
export const looksLikeHeic = (file: File) => HEIC_TYPES.includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);

/** The picker's accept list addition: HEIC by type and by extension. */
export const HEIC_ACCEPT = 'image/heic,image/heif,.heic,.heif';

/** The same photo as a JPEG when it is HEIC; any other file is returned unchanged. */
export async function jpegFromHeic(file: File): Promise<File> {
  if (!looksLikeHeic(file)) return file;
  const { heicTo } = await import('heic-to/next');
  const bitmap = await heicTo({ blob: file, type: 'bitmap' });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('Could not encode the photo');
    return new File([blob], `${file.name.replace(/\.(heic|heif)$/i, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
