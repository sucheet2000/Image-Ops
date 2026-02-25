import { formatToMime, type BackgroundRemoveOptions } from '@imageops/core';
import sharp from 'sharp';
import type { BackgroundRemoveProvider } from '../providers/bg-remove-provider';

/**
 * Remove the background from an image via the provided background-remove provider and encode the result in the requested output format.
 *
 * @param input - Input configuration for the background removal operation
 * @param input.bytes - Source image bytes to process
 * @param input.contentType - MIME type of the source image
 * @param input.options - Background removal options; `options.outputFormat` selects the output format (defaults to `"png"`)
 * @param input.provider - BackgroundRemoveProvider used to perform the background removal
 * @returns An object containing `bytes`, the encoded image bytes in the chosen format, and `contentType`, the resulting MIME type
 */
export async function runBackgroundRemove(input: {
  bytes: Buffer;
  contentType: string;
  options: BackgroundRemoveOptions;
  provider: BackgroundRemoveProvider;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const removed = await input.provider.removeBackground({
    bytes: input.bytes,
    contentType: input.contentType,
  });

  const outputFormat = input.options.outputFormat || 'png';

  if (outputFormat === 'png') {
    return {
      bytes: await sharp(removed.bytes).png().toBuffer(),
      contentType: formatToMime('png'),
    };
  }

  if (outputFormat === 'webp') {
    return {
      bytes: await sharp(removed.bytes).webp({ quality: 90 }).toBuffer(),
      contentType: formatToMime('webp'),
    };
  }

  return {
    bytes: await sharp(removed.bytes).jpeg({ quality: 90 }).toBuffer(),
    contentType: formatToMime('jpeg'),
  };
}
