import type { Bot, Context } from "grammy";
import type { Update } from "grammy/types";
import { logError } from "./errors.js";
import type { TableTarget } from "./game.js";
import type { GameStore } from "./game-store.js";
import { answerHand, selectedResult } from "./inline.js";
import { updateLobby, type LobbyAction } from "./lobby.js";
import { currentStatus, lobbyReplies, practiceMenuKeyboard, strings } from "./render.js";
import type { StickerCatalog } from "./stickers.js";
import { refreshTable } from "./table.js";

export const allowedUpdates: Array<Exclude<keyof Update, "update_id">> = [
  "message", "callback_query", "inline_query", "chosen_inline_result",
];

function callbackTarget(ctx: Context): TableTarget | null {
  const action = ctx.callbackQuery;
  if (action?.inline_message_id) return { inlineMessageId: action.inline_message_id };
  if (action?.message) return { chatId: action.message.chat.id, messageId: action.message.message_id };
  return null;
}

async function lobbyCallback(ctx: Context, store: GameStore, action: LobbyAction): Promise<void> {
  const target = callbackTarget(ctx);
  if (!target || !ctx.from) {
    await ctx.answerCallbackQuery({ text: strings.unavailable });
    return;
  }
  const { id, first_name, last_name } = ctx.from;
  const name = [first_name, last_name].filter(Boolean).join(" ");
  let text: string;
  try {
    text = lobbyReplies[await updateLobby(store, target, { id, name }, action)];
  } catch (error) {
    logError("Update lobby", error);
    text = strings.unavailable;
  }
  try {
    await ctx.answerCallbackQuery({ text });
  } finally {
    await refreshTable(ctx.api, store, target);
  }
}

export function configureBot(bot: Bot, username: string, store: GameStore, stickers: StickerCatalog): void {
  bot.on("inline_query", (ctx) => answerHand(ctx, store, stickers));
  bot.on("chosen_inline_result", (ctx) => selectedResult(ctx, store));
  bot.callbackQuery(/^lobby:(join|start|leave|end-practice)$/, (ctx) =>
    lobbyCallback(ctx, store, ctx.match[1] as LobbyAction),
  );
  bot.callbackQuery("move:receipt", (ctx) => ctx.answerCallbackQuery({ text: strings.movePending }));
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private" || ctx.match !== "status" || !ctx.from) {
      if (ctx.chat.type === "private") {
        const help = [strings.showHelp(username), strings.practiceHelp].join("\n\n");
        await ctx.reply(help, { reply_markup: practiceMenuKeyboard });
      } else {
        await ctx.reply(strings.showHelp(username));
      }
      return;
    }
    let status: string;
    try {
      status = currentStatus(await store.active(ctx.from.id), ctx.from.id);
    } catch (error) {
      logError("Read player status", error);
      status = strings.unavailable;
    }
    await ctx.reply(status);
  });
  bot.catch(({ error, ctx }) => logError(`Telegram update ${ctx.update.update_id}`, error));
}
