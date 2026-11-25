import { randomInt } from "node:crypto";
import { DECK, OPENER } from "./games/big2/cards.js";
import { dealBig2, type Big2State } from "./games/big2/index.js";
import { dealDominoes, TILES, type DominoState } from "./games/dominoes/index.js";

export type GameType = "big2" | "dominoes";
export type GameMode = "multiplayer" | "cpu";
export type GameState = Big2State | DominoState;
export type GameStatus = "lobby" | "playing" | "finished" | "abandoned";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const CPU_PLAYER_ID = 0;

export type Player = { id: number; name: string };
export type PositionedPlayer = Player & { seat: number };

export function cpuSeat(players: readonly Player[]): number {
  return players.findIndex(({ id }) => id === CPU_PLAYER_ID);
}

export type TableTarget =
  | { inlineMessageId: string }
  | { chatId: number; messageId: number };
export type GameReference = { id: string } | TableTarget;

export type Game = {
  id: string;
  type: GameType;
  status: GameStatus;
  hostId: number;
  players: PositionedPlayer[];
  state: GameState | null;
  version: number;
  target: TableTarget;
};

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function dealGame(type: GameType, players: number): GameState {
  if (type === "dominoes") return dealDominoes(shuffle(TILES), players);
  let deck = shuffle(DECK);
  while (deck.indexOf(OPENER) >= players * 13) deck = shuffle(DECK);
  return dealBig2(deck, players);
}
