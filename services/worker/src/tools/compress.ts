import { mimeToFormat, type CompressOptions } from "@image-ops/core";
import sharp from "sharp";

/**
 * Normalizes an image quality value into an integer between 1 and 100.
 *
 * @param value - Candidate quality value; if not a valid number or `NaN`, `fallback` is used
 * @param fallback - Value returned when `value` is missing or invalid
 * @returns An integer between 1 and 100 (value is rounded down to the nearest integer and clamped into this range)
 */
function clampQuality(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, Math.floor(value)));
}

/**
 * Compresses image bytes according to the input MIME type and compression options.
 *
 * Detects the target format from `input.contentType` (defaults to `jpeg` if unknown), normalizes the requested quality, rotates the image for correct orientation, and encodes it as PNG, WebP, or JPEG with format-appropriate settings.
 *
 * @param input - Object containing the image data and compression parameters:
 *   - `bytes`: the image data to compress
 *   - `contentType`: source MIME type used to select the output format
 *   - `options`: compression options (see `CompressOptions`)
 * @returns An object with `bytes` holding the compressed image buffer and `contentType` set to the resulting MIME type (`image/png`, `image/webp`, or `image/jpeg`)
 */
export async function runCompress(input: {
  bytes: Buffer;
  contentType: string;
  options: CompressOptions;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const format = mimeToFormat(input.contentType) || "jpeg";
  const quality = clampQuality(input.options.quality, 80);
  const base = sharp(input.bytes).rotate();

  if (format === "png") {
    const compressionLevel = Math.max(0, Math.min(9, Math.floor((100 - quality) / 10)));
    return {
      bytes: await base.png({ compressionLevel }).toBuffer(),
      contentType: "image/png"
    };
  }

  if (format === "webp") {
    return {
      bytes: await base.webp({ quality }).toBuffer(),
      contentType: "image/webp"
    };
  }

  return {
    bytes: await base.jpeg({ quality }).toBuffer(),
    contentType: "image/jpeg"
  };
}
