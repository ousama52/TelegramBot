export type Tile = readonly [low: number, high: number];
const PIPS = [0, 1, 2, 3, 4, 5, 6];
export const TILES: readonly Tile[] = PIPS.flatMap((low) =>
  PIPS.slice(low).map((high): Tile => [low, high]),
);
export const tileKey = (tile: Tile) => tile.join("-");
const total = ([low, high]: Tile) => low + high;
const openingScore = (tile: Tile) => tile[0] === tile[1] ? 100 + tile[0] : total(tile) * 7 + tile[1];

export type Side = "left" | "right" | "first";
export type Placement = { kind: "place"; key: string; side: Side };
export type DominoMove = Placement | { kind: "draw" } | { kind: "pass" };
type Action =
  | { kind: "place"; player: number; tile: Tile; side: Side }
  | { kind: "draw"; player: number; count: number }
  | { kind: "pass"; player: number };

export type DominoState = {
  type: "dominoes";
  turn: number;
  openingTile: string;
  hands: readonly (readonly Tile[])[];
  boneyard: readonly Tile[];
  chain: readonly Tile[];
  consecutivePasses: number;
  action: Action | null;
  outcome: { winner: number | null } | null;
};

export function dealDominoes(deck: readonly Tile[], players: number): DominoState {
  const hands = Array.from({ length: players }, (_, seat) => deck.slice(seat * 7, seat * 7 + 7));
  const dealt = hands.flat();
  const opener = dealt.reduce((best, tile) => openingScore(tile) > openingScore(best) ? tile : best);
  return {
    type: "dominoes", hands, turn: Math.floor(dealt.indexOf(opener) / 7), openingTile: tileKey(opener),
    boneyard: deck.slice(players * 7), chain: [], consecutivePasses: 0, action: null, outcome: null,
  };
}

export function ends(chain: readonly Tile[]): Tile | null {
  return chain.length ? [chain[0][0], chain[chain.length - 1][1]] : null;
}

function sides(tile: Tile, chain: readonly Tile[], openingTile: string): Side[] {
  const open = ends(chain);
  if (!open) return tileKey(tile) === openingTile ? ["first"] : [];
  const matches: Side[] = [];
  if (tile.includes(open[0])) matches.push("left");
  if (tile.includes(open[1])) matches.push("right");
  return matches;
}

export function legalDominoMoves(state: DominoState, player: number): DominoMove[] {
  if (state.outcome || state.turn !== player) return [];
  const placements = [...state.hands[player]].sort((a, b) => total(b) - total(a)).flatMap((tile) =>
    sides(tile, state.chain, state.openingTile).map((side): Placement => ({
      kind: "place", key: tileKey(tile), side,
    })),
  );
  if (placements.length) return placements;
  return [state.boneyard.length ? { kind: "draw" } : { kind: "pass" }];
}

function place(chain: readonly Tile[], tile: Tile, side: Side): readonly Tile[] {
  const open = ends(chain);
  if (!open) return [tile];
  const flipped: Tile = [tile[1], tile[0]];
  if (side === "left") return [tile[1] === open[0] ? tile : flipped, ...chain];
  return [...chain, tile[0] === open[1] ? tile : flipped];
}

function blockedWinner(hands: readonly (readonly Tile[])[]): number | null {
  const scores = hands.map((hand) => hand.reduce((sum, tile) => sum + total(tile), 0));
  const min = Math.min(...scores);
  return scores.filter((score) => score === min).length === 1 ? scores.indexOf(min) : null;
}

export function applyDominoes(state: DominoState, player: number, move: DominoMove): DominoState | null {
  const legal = legalDominoMoves(state, player).some((choice) => choice.kind === move.kind &&
    (choice.kind !== "place" || (move.kind === "place" && choice.key === move.key && choice.side === move.side)));
  if (!legal) return null;
  const turn = (player + 1) % state.hands.length;
  const hand = state.hands[player];

  if (move.kind === "pass") {
    const consecutivePasses = state.consecutivePasses + 1;
    const outcome = consecutivePasses === state.hands.length ? { winner: blockedWinner(state.hands) } : null;
    return { ...state, turn, consecutivePasses, outcome, action: { kind: "pass", player } };
  }
  if (move.kind === "draw") {
    const firstMatch = state.boneyard.findIndex((tile) => sides(tile, state.chain, state.openingTile).length);
    const count = firstMatch === -1 ? state.boneyard.length : firstMatch + 1;
    const drawn = state.boneyard.slice(0, count);
    const hands = state.hands.map((other, seat) => seat === player ? [...hand, ...drawn] : other);
    return { ...state, hands, boneyard: state.boneyard.slice(count), action: { kind: "draw", player, count } };
  }

  const tile = hand.find((held) => tileKey(held) === move.key);
  if (!tile) return null;
  const hands = state.hands.map((other, seat) => seat === player
    ? hand.filter((held) => tileKey(held) !== move.key) : other);
  return {
    ...state, hands, turn, chain: place(state.chain, tile, move.side), consecutivePasses: 0,
    outcome: hands[player].length === 0 ? { winner: player } : null,
    action: { kind: "place", player, tile, side: move.side },
  };
}
