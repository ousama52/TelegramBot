import { OPENER, type Card } from "./cards.js";
import { combinations, compareScores, scoreHand, type Score } from "./hands.js";

type Play = { player: number; cards: readonly Card[]; score: Score };
type Action = { kind: "play" | "pass"; player: number };
export type Big2Move = { kind: "play"; cards: readonly Card[] } | { kind: "pass" };

export type Big2State = {
  type: "big2";
  hands: readonly (readonly Card[])[];
  turn: number;
  lastPlay: Play | null;
  action: Action | null;
  leading: boolean;
  passed: readonly number[];
  outcome: { winner: number } | null;
};

export function dealBig2(deck: readonly Card[], players: number): Big2State {
  const hands = Array.from({ length: players }, (_, seat) =>
    deck.slice(seat * 13, seat * 13 + 13).sort((a, b) => a - b),
  );
  const turn = hands.findIndex((hand) => hand.includes(OPENER));
  if (turn === -1) throw new Error("The dealt cards must include the Big 2 opener.");
  return { type: "big2", hands, turn, lastPlay: null, action: null, leading: true, passed: [], outcome: null };
}

function canTakeTurn(state: Big2State, player: number): boolean {
  return !state.outcome && state.turn === player && !state.passed.includes(player);
}

export function canPass(state: Big2State, player: number): boolean {
  return canTakeTurn(state, player) && !state.leading;
}

function legalScore(state: Big2State, cards: readonly Card[]): Score | null {
  if (!state.lastPlay && !cards.includes(OPENER)) return null;
  const score = scoreHand(cards);
  if (!score) return null;
  if (state.leading || !state.lastPlay) return score;
  const previous = state.lastPlay.score;
  return score.size === previous.size && compareScores(score, previous) > 0 ? score : null;
}

export function legalBig2Plays(state: Big2State, player: number): Play[] {
  if (!canTakeTurn(state, player)) return [];
  const sizes = state.leading || !state.lastPlay ? [1, 2, 3, 5] : [state.lastPlay.score.size];
  const plays: Play[] = [];
  for (const size of sizes) {
    for (const cards of combinations(state.hands[player], size)) {
      const score = legalScore(state, cards);
      if (score) plays.push({ player, cards, score });
    }
  }
  return plays.sort((a, b) => b.score.size - a.score.size || compareScores(b.score, a.score));
}

function nextPlayer(state: Big2State, passed: readonly number[]): number {
  let player = (state.turn + 1) % state.hands.length;
  while (passed.includes(player)) player = (player + 1) % state.hands.length;
  return player;
}

export function applyBig2(state: Big2State, player: number, move: Big2Move): Big2State | null {
  if (!canTakeTurn(state, player)) return null;
  const action = { kind: move.kind, player };
  if (move.kind === "pass") {
    if (!canPass(state, player)) return null;
    const passed = [...state.passed, player];
    const turn = nextPlayer(state, passed);
    const leading = turn === state.lastPlay?.player;
    return { ...state, action, turn, leading, passed: leading ? [] : passed };
  }

  const score = legalScore(state, move.cards);
  if (!score || !move.cards.every((card) => state.hands[player].includes(card))) return null;
  const cards = [...move.cards].sort((a, b) => a - b);
  const hands = state.hands.map((hand, seat) => seat === player
    ? hand.filter((card) => !cards.includes(card)) : hand);
  const outcome = hands[player].length === 0 ? { winner: player } : null;
  return {
    ...state, hands, action, outcome, leading: false,
    lastPlay: { player, cards, score }, turn: nextPlayer(state, state.passed),
  };
}
