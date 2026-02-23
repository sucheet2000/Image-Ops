import { formatToMime, type ConvertOptions } from "@image-ops/core";
import sharp from "sharp";

/**
 * Convert image bytes to PNG, WebP, or JPEG (auto-rotating the image) and return the converted bytes with the correct MIME type.
 *
 * @param input - The conversion input.
 * @param input.bytes - Source image data.
 * @param input.options - Conversion options: `format` chooses "png", "webp", or "jpeg" (default); `quality` sets quality for WebP/JPEG and defaults to 85 when not provided. PNG uses Sharp's default encoder settings.
 * @returns An object containing `bytes`, the encoded image bytes, and `contentType`, the corresponding MIME type for the chosen format.
 */
export async function runConvert(input: {
  bytes: Buffer;
  options: ConvertOptions;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const base = sharp(input.bytes).rotate();

  if (input.options.format === "png") {
    return {
      bytes: await base.png().toBuffer(),
      contentType: formatToMime("png")
    };
  }

  if (input.options.format === "webp") {
    return {
      bytes: await base.webp({ quality: input.options.quality || 85 }).toBuffer(),
      contentType: formatToMime("webp")
    };
  }

  return {
    bytes: await base.jpeg({ quality: input.options.quality || 85 }).toBuffer(),
    contentType: formatToMime("jpeg")
  };
}
