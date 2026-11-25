import { AbortController, type AbortSignal } from "abort-controller";
import { GrammyError, type Api } from "grammy";
import { logError } from "./errors.js";
import type { GameReference } from "./game.js";
import type { GameStore } from "./game-store.js";
import { noKeyboard, table } from "./render.js";

async function edit(where: string, operation: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    await operation(controller.signal);
  } catch (error) {
    if (!(error instanceof GrammyError && /message is not modified/i.test(error.description))) logError(where, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function editInlineNotice(api: Api, inlineMessageId: string, text: string): Promise<void> {
  await edit("Edit inline notice", (signal) =>
    api.editMessageTextInline(inlineMessageId, text, { reply_markup: noKeyboard }, signal),
  );
}

export async function refreshTable(api: Api, store: GameStore, reference: GameReference): Promise<void> {
  try {
    // Keep overlapping Telegram edits in game order, after the move transaction has committed.
    await store.locked(reference, async (game) => {
      if (!game) return;
      const { text, keyboard } = table(game);
      const options = { reply_markup: keyboard, link_preview_options: { is_disabled: true } };
      const target = game.target;
      await edit("Edit game table", (signal) => "inlineMessageId" in target
        ? api.editMessageTextInline(target.inlineMessageId, text, options, signal)
        : api.editMessageText(target.chatId, target.messageId, text, options, signal),
      );
    });
  } catch (error) {
    logError("Refresh table", error);
  }
}
