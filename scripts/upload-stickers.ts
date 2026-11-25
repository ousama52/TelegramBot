import "./local-env.js";
import { stat } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { Api, GrammyError, InputFile } from "grammy";
import type { InputSticker, Sticker, StickerSet } from "grammy/types";
import { botOwnerId, requireSetting, verifyBotUsername } from "../src/config.js";
import { Database } from "../src/db.js";
import { SetupError, logError } from "../src/errors.js";
import { stickerPacks, type StickerPack } from "../src/stickers.js";
import { assetPath, matchSticker, stickerPixels } from "./sticker-images.js";

const suitEmoji: Record<string, string> = { D: "♦️", C: "♣️", H: "♥️", S: "♠️" };
const staticStickerLimit = 512_000;
const initialPackLimit = 50;

async function telegram<T>(operation: () => Promise<T>): Promise<T> {
  for (let retries = 0; ; retries++) {
    try {
      return await operation();
    } catch (error) {
      const delay = error instanceof GrammyError && error.error_code === 429 && error.parameters.retry_after;
      if (!delay || retries >= 3) throw error;
      await setTimeout(delay * 1_000);
    }
  }
}

async function existingSet(api: Api, name: string): Promise<StickerSet | null> {
  try {
    return await telegram(() => api.getStickerSet(name));
  } catch (error) {
    if (error instanceof GrammyError && error.error_code === 400 &&
        /STICKERSET_INVALID|sticker set not found/i.test(error.description)) return null;
    throw error;
  }
}

async function verifyFiles(packs: StickerPack[]): Promise<void> {
  for (const pack of packs) {
    for (const key of pack.keys) {
      const path = assetPath(pack, key);
      const info = await stat(path).catch(() => null);
      if (!info?.isFile() || info.size === 0 || info.size >= staticStickerLimit) {
        throw new SetupError(`Missing or invalid sticker at assets/stickers/${pack.directory}/${key}.webp.`);
      }
    }
  }
}

async function downloadSticker(api: Api, token: string, sticker: Sticker): Promise<Buffer> {
  const file = await telegram(() => api.getFile(sticker.file_id));
  if (!file.file_path) throw new SetupError("Telegram did not return a sticker download path.");
  const url = new URL(`/file/bot${token}/${file.file_path}`, "https://api.telegram.org");
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  if (!response.ok) throw new SetupError(`Telegram sticker download returned HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function identifyStickers(
  api: Api, token: string, pack: StickerPack, stickers: Sticker[], identities: Map<string, string>,
): Promise<Map<string, Sticker>> {
  const byId = new Map(stickers.map((sticker) => [sticker.file_unique_id, sticker]));
  const known = new Map<string, Sticker>();
  for (const key of pack.keys) {
    const match = byId.get(identities.get(key) ?? "");
    if (!match) continue;
    known.set(key, match);
    byId.delete(match.file_unique_id);
  }
  if (known.size === pack.keys.length || !byId.size) return known;

  console.log(`Checking ${byId.size} Telegram images in ${pack.title}.`);
  const references = await Promise.all(pack.keys.map(async (key) => ({
    key, pixels: await stickerPixels(assetPath(pack, key)),
  })));
  const unrecognized = [...byId.values()];
  for (let index = 0; index < unrecognized.length; index += 4) {
    const batch = await Promise.all(unrecognized.slice(index, index + 4).map(async (sticker) => {
      const pixels = await stickerPixels(await downloadSticker(api, token, sticker));
      return { key: matchSticker(pixels, references), sticker };
    }));
    for (const { key, sticker } of batch) {
      if (key && !known.has(key)) known.set(key, sticker);
    }
  }
  return known;
}

async function uploadMissing(api: Api, owner: number, pack: StickerPack, newSet: boolean, keys: string[]): Promise<void> {
  console.log(`Uploading ${keys.length} stickers to ${pack.title}.`);
  const missing: InputSticker[] = [];
  for (const key of keys) {
    const uploaded = await telegram(() =>
      api.uploadStickerFile(owner, "static", new InputFile(assetPath(pack, key))),
    );
    missing.push({
      sticker: uploaded.file_id, format: "static",
      emoji_list: [pack.directory === "cards" ? suitEmoji[key[1]] : "🎲"],
    });
  }
  if (newSet) {
    const initial = missing.splice(0, initialPackLimit);
    await telegram(() => api.createNewStickerSet(owner, pack.name, pack.title, initial));
  }
  for (const sticker of missing) await telegram(() => api.addStickerToSet(owner, pack.name, sticker));
}

async function syncPack(db: Database, api: Api, token: string, owner: number, pack: StickerPack): Promise<void> {
  await db.transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [pack.name]);
    const set = await existingSet(api, pack.name);
    const stored = await client.query<{ key: string; file_unique_id: string }>(
      "SELECT key, file_unique_id FROM stickers WHERE set_name = $1", [pack.name],
    );
    const identities = new Map(stored.rows.map(({ key, file_unique_id }) => [key, file_unique_id]));
    let files = await identifyStickers(api, token, pack, set?.stickers ?? [], identities);
    const missing = pack.keys.filter((key) => !files.has(key));
    if (missing.length) {
      await uploadMissing(api, owner, pack, !set, missing);
      const current = await telegram(() => api.getStickerSet(pack.name));
      const confirmedIds = new Map([...files].map(([key, sticker]) => [key, sticker.file_unique_id]));
      files = await identifyStickers(api, token, pack, current.stickers, confirmedIds);
    }

    for (const key of pack.keys) {
      const sticker = files.get(key);
      if (!sticker) throw new SetupError(`Could not match ${key} in Telegram pack ${pack.name}.`);
      await client.query(
        `INSERT INTO stickers (set_name, key, file_id, file_unique_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (set_name, key) DO UPDATE
         SET file_id = EXCLUDED.file_id, file_unique_id = EXCLUDED.file_unique_id`,
        [pack.name, key, sticker.file_id, sticker.file_unique_id],
      );
    }
  });
  console.log(`Ready: ${pack.name} (${pack.keys.length} stickers).`);
}

async function upload(): Promise<void> {
  const token = requireSetting("BOT_TOKEN");
  const url = requireSetting("DATABASE_URL");
  const owner = botOwnerId();
  requireSetting("BOT_USERNAME");
  const api = new Api(token, { timeoutSeconds: 45 });
  const bot = await telegram(() => api.getMe());
  const username = verifyBotUsername(bot.username);
  const packs = Object.values(stickerPacks(username));
  await verifyFiles(packs);
  const db = new Database(url);
  try {
    await db.pool.query("SELECT 1 FROM stickers LIMIT 1");
    for (const pack of packs) await syncPack(db, api, token, owner, pack);
  } finally {
    await db.pool.end();
  }
}

upload().catch((error) => {
  logError("Sticker upload failed", error);
  process.exitCode = 1;
});
