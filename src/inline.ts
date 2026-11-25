import type { Context } from "grammy";
import { logError } from "./errors.js";
import { cpuSeat } from "./game.js";
import type { GameStore } from "./game-store.js";
import { handResults, newGameResults, type InlineAnswer } from "./inline-results.js";
import { decodeMove, decodeNewGame, playMove } from "./move.js";
import { cpuQuery, currentStatus, inlineNotice, strings } from "./render.js";
import type { StickerCatalog } from "./stickers.js";
import { editInlineNotice, refreshTable } from "./table.js";

const notice = (message: string): InlineAnswer => ({ results: [], button: inlineNotice(message) });

async function availableResults(
  store: GameStore, stickers: StickerCatalog, query: NonNullable<Context["inlineQuery"]>,
): Promise<InlineAnswer> {
  if (query.chat_type === "channel") return notice(strings.chatOnly);
  const privateChat = query.chat_type === "private" || query.chat_type === "sender";
  const game = await store.active(query.from.id);
  if (!game) {
    const practice = privateChat || query.query.trim().toLowerCase() === cpuQuery;
    return { results: newGameResults(practice ? "cpu" : "multiplayer") };
  }
  if (privateChat && cpuSeat(game.players) === -1) return notice(strings.groupOnly);
  const seat = game.players.findIndex(({ id }) => id === query.from.id);
  if (!game.state || game.state.turn !== seat) return notice(currentStatus(game, query.from.id));
  return handResults(game, seat, stickers, query.offset);
}

export async function answerHand(ctx: Context, store: GameStore, stickers: StickerCatalog): Promise<void> {
  if (!ctx.inlineQuery) return;
  let answer: InlineAnswer;
  try {
    answer = await availableResults(store, stickers, ctx.inlineQuery);
  } catch (error) {
    logError("Read inline results", error);
    answer = notice(strings.unavailable);
  }
  const { results, ...options } = answer;
  await ctx.answerInlineQuery(results, { is_personal: true, cache_time: 0, ...options });
}

export async function selectedResult(ctx: Context, store: GameStore): Promise<void> {
  const selection = ctx.chosenInlineResult;
  if (!selection) return;
  const { result_id, from, inline_message_id } = selection;
  const newGame = decodeNewGame(result_id);
  if (newGame && inline_message_id) {
    try {
      const name = [from.first_name, from.last_name].filter(Boolean).join(" ");
      const result = await store.openGame(newGame.type, newGame.mode, { id: from.id, name }, inline_message_id);
      if (result === "busy") await editInlineNotice(ctx.api, inline_message_id, strings.lobbyBusy);
      else await refreshTable(ctx.api, store, { inlineMessageId: inline_message_id });
    } catch (error) {
      logError("Open game", error);
      await editInlineNotice(ctx.api, inline_message_id, strings.unavailable);
    }
    return;
  }

  const move = decodeMove(result_id);
  if (!move) return;
  let receipt: string;
  try {
    receipt = await playMove(store, from.id, move, inline_message_id) ? strings.moveAccepted : strings.moveStale;
  } catch (error) {
    logError("Play move", error);
    receipt = strings.unavailable;
  }
  await Promise.all([
    refreshTable(ctx.api, store, { id: move.id }),
    inline_message_id ? editInlineNotice(ctx.api, inline_message_id, receipt) : Promise.resolve(),
  ]);
}
