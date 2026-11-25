import { timingSafeEqual } from "node:crypto";
import { attachDatabasePool } from "@vercel/functions";
import { Bot, BotError } from "grammy";
import type { Update } from "grammy/types";
import { configureBot } from "../src/bot.js";
import { requireSetting, requireWebhookSecret, verifyBotUsername } from "../src/config.js";
import { Database } from "../src/db.js";
import { logError } from "../src/errors.js";
import { GameStore } from "../src/game-store.js";
import { loadStickers } from "../src/stickers.js";

const secretHeader = "x-telegram-bot-api-secret-token";
let app: Promise<Bot> | undefined;
let database: Database | undefined;

async function initializeBot(): Promise<Bot> {
  const bot = new Bot(requireSetting("BOT_TOKEN"), { client: { timeoutSeconds: 10 } });
  await bot.init();
  const username = verifyBotUsername(bot.botInfo.username);
  if (!database) {
    database = new Database(requireSetting("DATABASE_URL"));
    attachDatabasePool(database.pool);
  }
  const stickers = await loadStickers(database, username);
  configureBot(bot, username, new GameStore(database), stickers);
  return bot;
}

function authorized(request: Request): boolean {
  const header = request.headers.get(secretHeader);
  if (!header) return false;
  const expected = Buffer.from(requireWebhookSecret());
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isUpdate(value: unknown): value is Update {
  return typeof value === "object" && value !== null &&
    "update_id" in value && Number.isSafeInteger(value.update_id);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }

    try {
      if (!authorized(request)) return new Response(null, { status: 401 });
    } catch (error) {
      logError("Webhook configuration", error);
      return new Response(null, { status: 503 });
    }

    let update: unknown;
    try {
      update = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!isUpdate(update)) return new Response(null, { status: 400 });

    try {
      app ??= initializeBot().catch((error: unknown) => {
        app = undefined;
        throw error;
      });
      const bot = await app;
      await bot.handleUpdate(update);
      return new Response(null, { status: 200 });
    } catch (error) {
      logError(`Process Telegram webhook update ${update.update_id}`, error instanceof BotError ? error.error : error);
      return new Response(null, { status: 503 });
    }
  },
};
