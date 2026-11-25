import { flushTieBreak, rank, STRAIGHT_HIGH_RANK, straightTieBreak, suit, type Card } from "./cards.js";

export type Score = { size: number; category: number; strength: number };

export function scoreHand(cards: readonly Card[]): Score | null {
  const size = cards.length;
  if (![1, 2, 3, 5].includes(size) || new Set(cards).size !== size) return null;
  const sorted = [...cards].sort((a, b) => a - b);
  const high = sorted[size - 1];
  const counts = new Map<number, number>();
  for (const card of sorted) counts.set(rank(card), (counts.get(rank(card)) ?? 0) + 1);

  if (size < 5) {
    if (counts.size !== 1) return null;
    return { size, category: 0, strength: size === 3 ? rank(high) : high };
  }

  const straight = rank(high) <= STRAIGHT_HIGH_RANK &&
    sorted.every((card, index) => rank(card) === rank(sorted[0]) + index);
  const flush = sorted.every((card) => suit(card) === suit(high));
  if (straight && flush) return { size, category: 5, strength: straightTieBreak(high) };
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [mainRank, mainCount] = groups[0];
  if (mainCount === 4) return { size, category: 4, strength: mainRank };
  if (mainCount === 3 && groups[1][1] === 2) return { size, category: 3, strength: mainRank };
  if (flush) return { size, category: 2, strength: flushTieBreak(high) };
  if (straight) return { size, category: 1, strength: straightTieBreak(high) };
  return null;
}

export function compareScores(a: Score, b: Score): number {
  return a.category - b.category || a.strength - b.strength;
}

export function* combinations(
  hand: readonly Card[],
  size: number,
  start = 0,
  selected: readonly Card[] = [],
): Generator<readonly Card[]> {
  const needed = size - selected.length;
  if (needed === 0) {
    yield selected;
    return;
  }
  for (let index = start; index <= hand.length - needed; index++) {
    yield* combinations(hand, size, index + 1, [...selected, hand[index]]);
  }
}
