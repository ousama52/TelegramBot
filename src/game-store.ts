import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import type { Database } from "./db.js";
import { CPU_PLAYER_ID, dealGame } from "./game.js";
import type { Game, GameMode, GameReference, GameState, GameStatus, GameType, Player, TableTarget } from "./game.js";
import { playCpuTurn } from "./games/cpu.js";

type PlayerRow = { user_id: string; display_name: string; seat: number };
type GameRow = {
  id: string;
  type: GameType;
  status: GameStatus;
  host_user_id: string;
  state: GameState | null;
  version: number;
  inline_message_id: string | null;
  chat_id: string | null;
  message_id: number | null;
  expired: boolean;
};
const columns = "g.*, (g.updated_at < now() - interval '24 hours') AS expired";
const playersQuery = "SELECT user_id::text AS user_id, display_name, seat FROM game_players WHERE game_id = ";

function snapshot(row: GameRow, players: PlayerRow[]): Game {
  const target: TableTarget = row.inline_message_id
    ? { inlineMessageId: row.inline_message_id }
    : { chatId: Number(row.chat_id), messageId: row.message_id! };
  return {
    id: row.id, type: row.type, status: row.status, hostId: Number(row.host_user_id),
    state: row.state, version: row.version, target,
    players: players.map(({ user_id, display_name, seat }) => ({ id: Number(user_id), name: display_name, seat })),
  };
}

function lookup(reference: GameReference): [clause: string, values: (string | number)[]] {
  if ("id" in reference) return ["g.id = $1", [reference.id]];
  if ("inlineMessageId" in reference) return ["g.inline_message_id = $1", [reference.inlineMessageId]];
  return ["g.chat_id = $1 AND g.message_id = $2", [reference.chatId, reference.messageId]];
}

async function insertPlayer(client: PoolClient, gameId: string, player: Player, seat: number): Promise<void> {
  await client.query(
    "INSERT INTO game_players (game_id, user_id, display_name, seat) VALUES ($1, $2, $3, $4)",
    [gameId, player.id, player.name, seat],
  );
}

export async function reserveSeat(client: PoolClient, gameId: string, player: Player, seat: number): Promise<boolean> {
  await insertPlayer(client, gameId, player, seat);
  const reservation = await client.query(
    "INSERT INTO user_active_game (user_id, game_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING",
    [player.id, gameId],
  );
  if (reservation.rowCount) return true;
  await client.query("DELETE FROM game_players WHERE game_id = $1 AND user_id = $2", [gameId, player.id]);
  return false;
}

async function clearActive(client: PoolClient, gameId: string): Promise<void> {
  await client.query("DELETE FROM user_active_game WHERE game_id = $1", [gameId]);
}

export async function abandon(client: PoolClient, gameId: string): Promise<void> {
  await client.query("UPDATE games SET status = 'abandoned', updated_at = now() WHERE id = $1", [gameId]);
  await clearActive(client, gameId);
}

export async function saveState(client: PoolClient, gameId: string, state: GameState): Promise<void> {
  await client.query(
    `UPDATE games SET state = $2::jsonb, status = $3, version = version + 1, updated_at = now() WHERE id = $1`,
    [gameId, JSON.stringify(state), state.outcome ? "finished" : "playing"],
  );
  if (state.outcome) await clearActive(client, gameId);
}

export class GameStore {
  constructor(private readonly db: Database) {}

  async active(userId: number): Promise<Game | null> {
    const result = await this.db.pool.query<GameRow & { players: PlayerRow[] }>(
      `SELECT ${columns},
         COALESCE((
           SELECT json_agg(json_build_object('user_id', p.user_id::text, 'display_name', p.display_name, 'seat', p.seat)
                           ORDER BY p.seat)
           FROM game_players p WHERE p.game_id = g.id
         ), '[]'::json) AS players
       FROM user_active_game u JOIN games g ON g.id = u.game_id WHERE u.user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!row.expired) return snapshot(row, row.players);
    return this.locked<Game | null>({ id: row.id }, async (game) =>
      game && (game.status === "lobby" || game.status === "playing") &&
      game.players.some((player) => player.id === userId) ? game : null,
    );
  }

  async locked<T>(
    reference: GameReference,
    work: (game: Game | null, client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (client) => {
      const [clause, values] = lookup(reference);
      const result = await client.query<GameRow>(
        `SELECT ${columns} FROM games g WHERE ${clause} FOR UPDATE OF g`, values,
      );
      const row = result.rows[0];
      if (!row) return work(null, client);
      if (row.expired && (row.status === "lobby" || row.status === "playing")) {
        await abandon(client, row.id);
        row.status = "abandoned";
      }
      const players = await client.query<PlayerRow>(playersQuery + "$1 ORDER BY seat", [row.id]);
      return work(snapshot(row, players.rows), client);
    });
  }

  async openGame(type: GameType, mode: GameMode, host: Player, inlineMessageId: string): Promise<"ready" | "busy"> {
    await this.active(host.id);
    return this.db.transaction(async (client) => {
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO games (id, type, status, host_user_id, inline_message_id)
         VALUES ($1, $2, 'lobby', $3, $4) ON CONFLICT (inline_message_id) DO NOTHING`,
        [id, type, host.id, inlineMessageId],
      );
      if (!result.rowCount) return "ready";
      if (!await reserveSeat(client, id, host, 0)) {
        await abandon(client, id);
        return "busy";
      }
      if (mode === "cpu") {
        const seat = 1;
        await insertPlayer(client, id, { id: CPU_PLAYER_ID, name: "" }, seat);
        await saveState(client, id, playCpuTurn(dealGame(type, 2), seat));
      }
      return "ready";
    });
  }
}
