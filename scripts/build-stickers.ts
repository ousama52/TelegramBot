import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));
const output = join(assets, "stickers");
const cardSize = { width: 342, height: 512, radius: 28 };
const dominoSize = { width: 512, height: 256, radius: 26 };
const fontFamily = "Arial, sans-serif";
const black = "#141820";
const red = "#A71931";

const ranks = ["3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2"];
const suits = [
  { key: "D", color: red, shape: '<path d="M50 4 92 50 50 96 8 50Z"/>' },
  { key: "C", color: black, shape: '<circle cx="50" cy="29" r="23"/><circle cx="28" cy="58" r="22"/><circle cx="72" cy="58" r="22"/><path d="M42 46h16c-1 28 2 39 11 48H31c9-9 12-20 11-48Z"/>' },
  { key: "H", color: red, shape: '<path d="M50 91C40 82 5 57 5 32 5 9 34 0 50 23 66 0 95 9 95 32 95 57 60 82 50 91Z"/>' },
  { key: "S", color: black, shape: '<path d="M50 5c10 13 44 33 44 55 0 23-27 30-43 13 1 9 6 16 14 22H35c8-6 13-13 14-22C33 90 6 83 6 60 6 38 40 18 50 5Z"/>' },
] as const;

const pipCounts = [0, 1, 2, 3, 4, 5, 6] as const;
const pipPatterns = [
  [],
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
] as const;

type Size = { width: number; height: number };
type Face = Size & { radius: number };
type Suit = (typeof suits)[number];
type PipCount = (typeof pipCounts)[number];
type Sticker = { key: string; marks: string };

function svg({ width, height }: Size, contents: string, scale = 1): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">${contents}</svg>`,
  );
}

function text(value: string, x: number, y: number, size: number, weight: number, color: string): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" fill="${color}">${value}</text>`;
}

function suitMark(suit: Suit, x: number, y: number, size: number): string {
  return `<g fill="${suit.color}" transform="translate(${x - size / 2} ${y}) scale(${size / 100})">${suit.shape}</g>`;
}

function cardMarks(rank: string, suit: Suit): string {
  const label = rank === "T" ? "10" : rank;
  const corner = text(label, 69, 84, 46, 700, suit.color) + suitMark(suit, 69, 94, 31);
  const center = text(label, 171, 235, 154, 700, suit.color) + suitMark(suit, 171, 258, 144);
  return corner + center + `<g transform="rotate(180 171 256)">${corner}</g>`;
}

function pips(count: PipCount, centerX: number): string {
  return pipPatterns[count].map(([dx, dy]) =>
    `<circle cx="${centerX + dx * 57}" cy="${128 + dy * 57}" r="16" fill="${black}"/>`,
  ).join("");
}

const cards = suits.flatMap((suit) => ranks.map((rank) => ({
  key: rank + suit.key,
  marks: cardMarks(rank, suit),
})));

const dominoes = pipCounts.flatMap((low) => pipCounts.slice(low).map((high) => ({
  key: `${low}-${high}`,
  marks: pips(low, 128) + pips(high, 384),
})));

async function buildSet(
  artFile: string,
  directory: string,
  face: Face,
  stickers: Sticker[],
): Promise<void> {
  const location = join(output, directory);
  await mkdir(location, { recursive: true });
  const scale = 2;
  const base = await sharp(join(assets, "art", artFile))
    .resize(face.width * scale, face.height * scale, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = svg(face,
    `<rect width="${face.width}" height="${face.height}" rx="${face.radius}" fill="white"/>`,
    scale,
  );

  for (const { key, marks } of stickers) {
    const { data, info } = await sharp(base)
      .composite([
        { input: svg(face, marks, scale) },
        { input: mask, blend: "dest-in" },
      ])
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = await sharp(data, { raw: info })
      .resize(face.width, face.height)
      .webp({ lossless: true })
      .toFile(join(location, `${key}.webp`));
    if (result.size >= 512_000) {
      throw new Error(`${key}.webp exceeds the Telegram sticker size limit.`);
    }
  }
}

type SheetGrid = {
  directory: string;
  stickers: Sticker[];
  columns: number;
  cell: Size;
  thumbnail: Size;
  top: number;
};

async function sheetGrid(grid: SheetGrid): Promise<{ images: sharp.OverlayOptions[]; labels: string }> {
  const images: sharp.OverlayOptions[] = [];
  const labels: string[] = [];
  for (const [index, { key }] of grid.stickers.entries()) {
    const left = 24 + (index % grid.columns) * grid.cell.width;
    const top = grid.top + Math.floor(index / grid.columns) * grid.cell.height;
    const thumb = await sharp(join(output, grid.directory, `${key}.webp`))
      .resize(grid.thumbnail.width, grid.thumbnail.height, { fit: "contain", background: "#0000" })
      .png()
      .toBuffer();
    images.push({ input: thumb, left: left + (grid.cell.width - grid.thumbnail.width) / 2, top });
    labels.push(text(key, left + grid.cell.width / 2, top + grid.thumbnail.height + 18, 14, 700, black));
  }
  return { images, labels: labels.join("") };
}

async function buildContactSheet(): Promise<void> {
  const size = { width: 1374, height: 1122 };
  const [cardGrid, dominoGrid] = await Promise.all([
    sheetGrid({
      directory: "cards", stickers: cards, columns: 13,
      cell: { width: 102, height: 154 }, thumbnail: { width: 86, height: 128 }, top: 62,
    }),
    sheetGrid({
      directory: "dominoes", stickers: dominoes, columns: 7,
      cell: { width: 188, height: 96 }, thumbnail: { width: 144, height: 72 }, top: 726,
    }),
  ]);
  const labels = text("Big 2 · 52 cards", size.width / 2, 39, 23, 700, black)
    + text("Dominoes · 28 tiles", size.width / 2, 703, 23, 700, black)
    + cardGrid.labels + dominoGrid.labels;
  await sharp({ create: { ...size, channels: 3, background: "#E8EDF2" } })
    .composite([...cardGrid.images, ...dominoGrid.images, { input: svg(size, labels) }])
    .png()
    .toFile(join(assets, "sticker-contact-sheet.png"));
}

await Promise.all([
  buildSet("card-face.png", "cards", cardSize, cards),
  buildSet("domino-face.png", "dominoes", dominoSize, dominoes),
]);
await buildContactSheet();
console.log(`Built ${cards.length} cards, ${dominoes.length} dominoes and assets/sticker-contact-sheet.png.`);
