import "./local-env.js";
import { Api } from "grammy";
import { allowedUpdates } from "../src/bot.js";
import { requireSetting, requireWebhookSecret, requireWebhookUrl, verifyBotUsername } from "../src/config.js";
import { SetupError, logError } from "../src/errors.js";

async function setWebhook(): Promise<void> {
  const url = requireWebhookUrl();
  const secret = requireWebhookSecret();
  const api = new Api(requireSetting("BOT_TOKEN"), { timeoutSeconds: 15 });
  const bot = await api.getMe();
  const username = verifyBotUsername(bot.username);
  if (!bot.supports_inline_queries || !bot.can_join_groups) {
    throw new SetupError("Enable inline mode and group joining in BotFather.");
  }
  await api.setWebhook(url, { secret_token: secret, allowed_updates: allowedUpdates, drop_pending_updates: false });
  const info = await api.getWebhookInfo();
  if (info.url !== url || !allowedUpdates.every((type) => info.allowed_updates?.includes(type))) {
    throw new SetupError("Telegram did not confirm the expected webhook URL and update types.");
  }
  console.log(`Webhook is active for @${username} at ${url}.`);
}

setWebhook().catch((error: unknown) => {
  logError("Register webhook", error);
  process.exitCode = 1;
});
