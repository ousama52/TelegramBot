import type { InlineQueryResult, InlineQueryResultsButton } from "grammy/types";
import type { Game, GameMode, GameType } from "./game.js";
import { cardKey } from "./games/big2/cards.js";
import { canPass, legalBig2Plays } from "./games/big2/index.js";
import { legalDominoMoves } from "./games/dominoes/index.js";
import { encodeMove, newGameId } from "./move.js";
import { handTitle, lobbyKeyboard, practiceStartKeyboard, receiptKeyboard, strings, tileTitle } from "./render.js";
import type { StickerCatalog } from "./stickers.js";

export type InlineAnswer = {
  results: InlineQueryResult[];
  button?: InlineQueryResultsButton;
  next_offset?: string;
};

const pendingMessage = { message_text: strings.movePending };
const moveSend = { reply_markup: receiptKeyboard, input_message_content: pendingMessage };

function moveArticle(id: string, title: string): InlineQueryResult {
  return { type: "article", id, title, ...moveSend };
}

function moveSticker(id: string, fileId: string): InlineQueryResult {
  return { type: "sticker", id, sticker_file_id: fileId, ...moveSend };
}

export function newGameResults(mode: GameMode): InlineQueryResult[] {
  const types: GameType[] = ["big2", "dominoes"];
  return types.map((type) => ({
    type: "article",
    id: newGameId(type, mode),
    title: strings.newGameTitle(type, mode),
    input_message_content: { message_text: strings.newGameMessage(type, mode) },
    reply_markup: mode === "cpu" ? practiceStartKeyboard : lobbyKeyboard,
  }));
}

function pageStart(offset: string, revision: string, length: number): number {
  const match = /^([0-9a-z]{1,6}):(\d{1,4})$/.exec(offset);
  const index = Number(match?.[2]);
  return match?.[1] === revision && index < length ? index : 0;
}

function big2Results(game: Game, seat: number, stickers: StickerCatalog, offset: string): InlineAnswer {
  const state = game.state;
  if (state?.type !== "big2") return { results: [] };
  const plays = legalBig2Plays(state, seat);
  const pass = canPass(state, seat);
  const pageSize = pass ? 49 : 50;
  const revision = game.version.toString(36);
  const start = pageStart(offset, revision, plays.length);
  const results = plays.slice(start, start + pageSize).map(({ cards, score }) => {
    const id = encodeMove(game, { type: "big2", move: { kind: "play", cards } });
    return cards.length === 1
      ? moveSticker(id, stickers.big2.get(cardKey(cards[0]))!)
      : moveArticle(id, handTitle(score, cards));
  });
  if (pass) results.push(moveArticle(encodeMove(game, { type: "big2", move: { kind: "pass" } }), strings.pass));
  const next = start + pageSize;
  return { results, next_offset: next < plays.length ? `${revision}:${next}` : "" };
}

function dominoResults(game: Game, seat: number, stickers: StickerCatalog): InlineAnswer {
  const state = game.state;
  if (state?.type !== "dominoes") return { results: [] };
  const moves = legalDominoMoves(state, seat);
  const counts = new Map<string, number>();
  for (const move of moves) {
    if (move.kind === "place") counts.set(move.key, (counts.get(move.key) ?? 0) + 1);
  }
  const results = moves.map((move) => {
    const id = encodeMove(game, { type: "dominoes", move });
    if (move.kind !== "place") return moveArticle(id, move.kind === "pass" ? strings.pass : strings.draw);
    return counts.get(move.key) === 1
      ? moveSticker(id, stickers.dominoes.get(move.key)!)
      : moveArticle(id, tileTitle(move.key, move.side));
  });
  return { results };
}

export function handResults(game: Game, seat: number, stickers: StickerCatalog, offset: string): InlineAnswer {
  return game.type === "big2" ? big2Results(game, seat, stickers, offset) : dominoResults(game, seat, stickers);
}
