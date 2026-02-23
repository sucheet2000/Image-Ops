import { formatToMime, type ConvertOptions } from "@image-ops/core";
import sharp from "sharp";

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
