import { mimeToFormat, type ResizeOptions } from "@image-ops/core";
import sharp from "sharp";

export async function runResize(input: {
  bytes: Buffer;
  contentType: string;
  options: ResizeOptions;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const format = mimeToFormat(input.contentType) || "jpeg";
  const transformer = sharp(input.bytes).rotate().resize({
    width: input.options.width,
    height: input.options.height,
    fit: input.options.fit || "inside",
    withoutEnlargement: true
  });

  let output: Buffer;
  if (format === "png") {
    output = await transformer.png().toBuffer();
    return { bytes: output, contentType: "image/png" };
  }
  if (format === "webp") {
    output = await transformer.webp().toBuffer();
    return { bytes: output, contentType: "image/webp" };
  }

  output = await transformer.jpeg().toBuffer();
  return { bytes: output, contentType: "image/jpeg" };
}
