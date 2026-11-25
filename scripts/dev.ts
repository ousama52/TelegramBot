import "./local-env.js";
import { Bot } from "grammy";
import { allowedUpdates, configureBot } from "../src/bot.js";
import { requireSetting, verifyBotUsername } from "../src/config.js";
import { Database } from "../src/db.js";
import { SetupError, logError } from "../src/errors.js";
import { GameStore } from "../src/game-store.js";
import { loadStickers } from "../src/stickers.js";

async function poll(): Promise<void> {
  const token = requireSetting("BOT_TOKEN");
  const url = requireSetting("DATABASE_URL");
  requireSetting("BOT_USERNAME");
  const bot = new Bot(token);
  await bot.init();
  const username = verifyBotUsername(bot.botInfo.username);
  if (!bot.botInfo.supports_inline_queries || !bot.botInfo.can_join_groups) {
    throw new SetupError("Enable inline mode and group joining in BotFather.");
  }
  if ((await bot.api.getWebhookInfo()).url) {
    throw new SetupError("This bot has an active webhook. Remove it before starting polling.");
  }

  const db = new Database(url);
  const stop = () => {
    if (bot.isRunning()) void bot.stop().catch((error) => logError("Stop polling", error));
  };
  try {
    configureBot(bot, username, new GameStore(db), await loadStickers(db, username));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await bot.start({
      allowed_updates: allowedUpdates,
      onStart: () => console.log(`Polling @${username}. Press Ctrl+C to stop.`),
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await db.pool.end();
  }
}

poll().catch((error) => {
  logError("Polling could not start", error);
  process.exitCode = 1;
});
