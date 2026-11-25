import { SetupError } from "./errors.js";

type Setting = "BOT_TOKEN" | "BOT_USERNAME" | "BOT_OWNER_ID" | "DATABASE_URL" | "WEBHOOK_SECRET" | "WEBHOOK_URL";

export function requireSetting(name: Setting): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SetupError(`Set ${name} in .env before running this command.`);
  return value;
}

export function botOwnerId(): number {
  const value = requireSetting("BOT_OWNER_ID");
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
    throw new SetupError("BOT_OWNER_ID must be a positive Telegram user ID.");
  }
  return id;
}

export function verifyBotUsername(actual: string | undefined): string {
  if (!actual) throw new SetupError("Telegram did not return a username for this bot.");
  const expected = requireSetting("BOT_USERNAME").replace(/^@/, "");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new SetupError(`BOT_USERNAME does not match the token. Telegram returned @${actual}.`);
  }
  return actual;
}

export function requireWebhookSecret(): string {
  const value = requireSetting("WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new SetupError("WEBHOOK_SECRET must contain 1–256 letters, digits, underscores or hyphens.");
  }
  return value;
}

export function requireWebhookUrl(): string {
  const value = requireSetting("WEBHOOK_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SetupError("WEBHOOK_URL must be an HTTPS URL ending in /api/webhook.");
  }
  if (url.protocol !== "https:" || url.pathname !== "/api/webhook" ||
      url.username || url.password || url.search || url.hash) {
    throw new SetupError("WEBHOOK_URL must be an HTTPS URL ending in /api/webhook.");
  }
  return url.href;
}
