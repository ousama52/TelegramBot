import type { GameState } from "../game.js";
import { applyBig2, legalBig2Plays } from "./big2/index.js";
import { applyDominoes, legalDominoMoves } from "./dominoes/index.js";

function play(state: GameState, seat: number): GameState | null {
  if (state.type === "big2") {
    const best = legalBig2Plays(state, seat)[0];
    return applyBig2(state, seat, best ? { kind: "play", cards: best.cards } : { kind: "pass" });
  }
  const [move] = legalDominoMoves(state, seat);
  return move ? applyDominoes(state, seat, move) : null;
}

export function playCpuTurn(state: GameState, seat: number): GameState {
  let current = state;
  while (!current.outcome && current.turn === seat) {
    const next = play(current, seat);
    if (!next) throw new Error("The CPU has no legal action on its turn.");
    current = next;
  }
  return current;
}
