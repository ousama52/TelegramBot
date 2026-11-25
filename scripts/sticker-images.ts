import { resolve } from "node:path";
import sharp from "sharp";
import type { StickerPack } from "../src/stickers.js";

export function assetPath(pack: StickerPack, key: string): string {
  return resolve("assets", "stickers", pack.directory, `${key}.webp`);
}

export function stickerPixels(image: string | Buffer): Promise<Buffer> {
  return sharp(image).resize(64, 64, { fit: "fill" })
    .extract({ left: 6, top: 6, width: 52, height: 52 })
    .flatten({ background: "#ffffff" }).greyscale().raw().toBuffer();
}

export function matchSticker(pixels: Buffer, references: Array<{ key: string; pixels: Buffer }>): string | undefined {
  const matches = references.map((reference) => {
    const difference = pixels.reduce((total, pixel, index) =>
      total + Math.abs(pixel - reference.pixels[index]), 0);
    return { key: reference.key, error: difference / pixels.length };
  }).sort((a, b) => a.error - b.error);
  const [best, next] = matches;
  // Telegram re-encodes the WebP. Require both a close match and a clear gap to the next candidate.
  if (best && next && best.error <= 2 && next.error - best.error >= 1) return best.key;
  return undefined;
}
