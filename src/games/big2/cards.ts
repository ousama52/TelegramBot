export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2"] as const;
export const SUITS = ["D", "C", "H", "S"] as const;
export const OPENER = 0; // 3 of diamonds
export const DECK = Array.from({ length: RANKS.length * SUITS.length }, (_, index) => index);

export type Card = number;
export const rank = (card: Card) => Math.floor(card / SUITS.length);
export const suit = (card: Card) => card % SUITS.length;
export const cardKey = (card: Card) => RANKS[rank(card)] + SUITS[suit(card)];

export const STRAIGHT_HIGH_RANK = RANKS.indexOf("A");
export const straightTieBreak = (highest: Card) => highest;
export const flushTieBreak = (highest: Card) => highest;
