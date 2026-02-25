import sharp from 'sharp';

/**
 * Escape special XML characters in a string for safe inclusion in XML or SVG content.
 *
 * @param value - The input string to escape
 * @returns The input string with `&`, `<`, `>`, `"` and `'` replaced by their XML entity equivalents
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Apply a right-aligned watermark label over an image and return the composited image.
 *
 * @param input.bytes - Source image data
 * @param input.contentType - Original image content type; returned unchanged
 * @param input.label - Optional watermark text; defaults to "Image Ops" when omitted
 * @returns An object with `bytes` containing the image data with the watermark applied and `contentType` preserved from the input
 */
export async function applyWatermark(input: {
  bytes: Buffer;
  contentType: string;
  label?: string;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const image = sharp(input.bytes);
  const metadata = await image.metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 800;
  const label = escapeXml(input.label || 'Image Ops');

  const watermarkSvg = `
    <svg width="${width}" height="${height}">
      <rect x="0" y="${height - 64}" width="${width}" height="64" fill="rgba(0,0,0,0.35)" />
      <text x="${width - 24}" y="${height - 24}" text-anchor="end" font-family="Arial" font-size="28" fill="rgba(255,255,255,0.92)">${label}</text>
    </svg>
  `;

  const composited = await image
    .composite([{ input: Buffer.from(watermarkSvg), top: 0, left: 0 }])
    .toBuffer();

  return {
    bytes: composited,
    contentType: input.contentType,
  };
}
