import { mimeToFormat, type CompressOptions } from "@image-ops/core";
import sharp from "sharp";

function clampQuality(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, Math.floor(value)));
}

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
