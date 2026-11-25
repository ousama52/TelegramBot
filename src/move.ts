import { saveState, type GameStore } from "./game-store.js";
import { cpuSeat, type GameMode, type GameState, type GameType } from "./game.js";
import { applyBig2, type Big2Move } from "./games/big2/index.js";
import { DECK } from "./games/big2/cards.js";
import { applyDominoes, type DominoMove, type Side } from "./games/dominoes/index.js";
import { playCpuTurn } from "./games/cpu.js";

type Choice =
  | { type: "big2"; move: Big2Move }
  | { type: "dominoes"; move: DominoMove };
type Address = { id: string; version: number };
type SelectedMove = Choice & Address;

const sideCode: Record<Side, string> = { first: "f", left: "l", right: "r" };
const sideForCode = { f: "first", l: "left", r: "right" } as const;
const movePattern = /^(b2|dm):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):([0-9a-z]{1,6}):([0-9a-z]{1,10})$/;

export function encodeMove(game: Address, choice: Choice): string {
  const move = choice.move;
  let code: string;
  switch (move.kind) {
    case "pass": code = "p"; break;
    case "draw": code = "d"; break;
    case "place": code = sideCode[move.side] + move.key.replace("-", ""); break;
    case "play": code = move.cards.map((card) => card.toString(36).padStart(2, "0")).join(""); break;
  }
  const tag = choice.type === "big2" ? "b2" : "dm";
  return `${tag}:${game.id}:${game.version.toString(36)}:${code}`;
}

function parseBig2(code: string): Big2Move | null {
  if (code === "p") return { kind: "pass" };
  if (!/^(?:[0-9a-z]{2}){1,5}$/.test(code)) return null;
  const cards = [...code.matchAll(/[0-9a-z]{2}/g)].map(([part]) => Number.parseInt(part, 36));
  return cards.every((card) => card < DECK.length) ? { kind: "play", cards } : null;
}

function parseDominoes(code: string): DominoMove | null {
  if (code === "p") return { kind: "pass" };
  if (code === "d") return { kind: "draw" };
  const match = /^([flr])([0-6])([0-6])$/.exec(code);
  if (!match || match[2] > match[3]) return null;
  return { kind: "place", side: sideForCode[match[1] as keyof typeof sideForCode], key: `${match[2]}-${match[3]}` };
}

export function decodeMove(resultId: string): SelectedMove | null {
  const match = movePattern.exec(resultId);
  if (!match) return null;
  const [, tag, id, revision, code] = match;
  const address = { id, version: Number.parseInt(revision, 36) };
  if (tag === "b2") {
    const move = parseBig2(code);
    return move && { ...address, type: "big2", move };
  }
  const move = parseDominoes(code);
  return move && { ...address, type: "dominoes", move };
}

export function newGameId(type: GameType, mode: GameMode): string {
  return `${mode === "cpu" ? "cpu" : "new"}:${type}`;
}

export function decodeNewGame(id: string): { type: GameType; mode: GameMode } | null {
  const [prefix, type, extra] = id.split(":");
  if (extra !== undefined || (prefix !== "new" && prefix !== "cpu") ||
      (type !== "big2" && type !== "dominoes")) return null;
  return { type, mode: prefix === "cpu" ? "cpu" : "multiplayer" };
}

export async function playMove(
  store: GameStore, userId: number, selected: SelectedMove, inlineMessageId?: string,
): Promise<boolean> {
  if (userId <= 0) return false;
  return store.locked({ id: selected.id }, async (game, client) => {
    if (!game || game.type !== selected.type) return false;
    const selection = [game.id, selected.version, userId, inlineMessageId];
    if (inlineMessageId && selected.version < game.version) {
      const accepted = await client.query(
        `SELECT 1 FROM accepted_inline_moves
         WHERE game_id = $1 AND version = $2 AND user_id = $3 AND inline_message_id = $4`,
        selection,
      );
      return Boolean(accepted.rowCount);
    }
    if (game.status !== "playing" || !game.state || game.version !== selected.version) return false;
    const seat = game.players.findIndex((player) => player.id === userId);
    if (seat === -1 || game.state.turn !== seat) return false;

    let next: GameState | null = null;
    if (game.state.type === "big2" && selected.type === "big2") next = applyBig2(game.state, seat, selected.move);
    if (game.state.type === "dominoes" && selected.type === "dominoes") next = applyDominoes(game.state, seat, selected.move);
    if (!next) return false;
    await saveState(client, game.id, playCpuTurn(next, cpuSeat(game.players)));
    if (inlineMessageId) {
      await client.query(
        "INSERT INTO accepted_inline_moves (game_id, version, user_id, inline_message_id) VALUES ($1, $2, $3, $4)",
        selection,
      );
    }
    return true;
  });
}
