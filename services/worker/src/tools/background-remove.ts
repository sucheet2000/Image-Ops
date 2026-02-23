import { formatToMime, type BackgroundRemoveOptions } from "@image-ops/core";
import sharp from "sharp";
import type { BackgroundRemoveProvider } from "../providers/bg-remove-provider";

export async function runBackgroundRemove(input: {
  bytes: Buffer;
  contentType: string;
  options: BackgroundRemoveOptions;
  provider: BackgroundRemoveProvider;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const removed = await input.provider.removeBackground({
    bytes: input.bytes,
    contentType: input.contentType
  });

  const outputFormat = input.options.outputFormat || "png";

  if (outputFormat === "png") {
    return {
      bytes: await sharp(removed.bytes).png().toBuffer(),
      contentType: formatToMime("png")
    };
  }

  if (outputFormat === "webp") {
    return {
      bytes: await sharp(removed.bytes).webp({ quality: 90 }).toBuffer(),
      contentType: formatToMime("webp")
    };
  }

  return {
    bytes: await sharp(removed.bytes).jpeg({ quality: 90 }).toBuffer(),
    contentType: formatToMime("jpeg")
  };
}
