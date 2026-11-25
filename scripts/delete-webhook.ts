import "./local-env.js";
import { Api } from "grammy";
import { requireSetting, verifyBotUsername } from "../src/config.js";
import { SetupError, logError } from "../src/errors.js";

async function deleteWebhook(): Promise<void> {
  const api = new Api(requireSetting("BOT_TOKEN"), { timeoutSeconds: 15 });
  const username = verifyBotUsername((await api.getMe()).username);
  await api.deleteWebhook({ drop_pending_updates: false });
  if ((await api.getWebhookInfo()).url) throw new SetupError("Telegram still reports an active webhook.");
  console.log(`Webhook cleared for @${username}. You can now run npm run dev.`);
}

deleteWebhook().catch((error: unknown) => {
  logError("Remove webhook", error);
  process.exitCode = 1;
});
