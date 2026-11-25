import type { PoolClient } from "@neondatabase/serverless";
import { abandon, reserveSeat, saveState, type GameStore } from "./game-store.js";
import { cpuSeat, dealGame, MAX_PLAYERS, MIN_PLAYERS, type Game, type Player, type TableTarget } from "./game.js";

export type LobbyAction = "join" | "leave" | "start" | "end-practice";
export type LobbyReply =
  | "joined" | "alreadyJoined" | "busy" | "full" | "left" | "notJoined"
  | "started" | "hostOnly" | "needPlayers" | "closed" | "pending" | "practiceEnded" | "practiceHostOnly";

async function join(client: PoolClient, game: Game, player: Player): Promise<LobbyReply> {
  if (game.players.some(({ id }) => id === player.id)) return "alreadyJoined";
  if (game.players.length >= MAX_PLAYERS) return "full";
  if (!await reserveSeat(client, game.id, player, game.players[game.players.length - 1].seat + 1)) return "busy";
  await client.query("UPDATE games SET updated_at = now() WHERE id = $1", [game.id]);
  return "joined";
}

async function leave(client: PoolClient, game: Game, player: Player): Promise<LobbyReply> {
  const result = await client.query("DELETE FROM game_players WHERE game_id = $1 AND user_id = $2", [game.id, player.id]);
  if (!result.rowCount) return "notJoined";
  const next = game.players.find(({ id }) => id !== player.id);
  if (!next) {
    await abandon(client, game.id);
  } else {
    const hostId = game.hostId === player.id ? next.id : game.hostId;
    await client.query("UPDATE games SET host_user_id = $2, updated_at = now() WHERE id = $1", [game.id, hostId]);
  }
  return "left";
}

async function start(client: PoolClient, game: Game, player: Player): Promise<LobbyReply> {
  if (game.hostId !== player.id) return "hostOnly";
  if (game.players.length < MIN_PLAYERS) return "needPlayers";
  await saveState(client, game.id, dealGame(game.type, game.players.length));
  return "started";
}

export async function updateLobby(
  store: GameStore, target: TableTarget, player: Player, action: LobbyAction,
): Promise<LobbyReply> {
  if (action === "join") await store.active(player.id);
  return store.locked(target, async (game, client) => {
    if (!game) return "pending";
    if (action === "end-practice") {
      if (game.status !== "playing" || cpuSeat(game.players) === -1) return "closed";
      if (game.hostId !== player.id) return "practiceHostOnly";
      await abandon(client, game.id);
      return "practiceEnded";
    }
    if (game.status !== "lobby") return "closed";
    switch (action) {
      case "join": return join(client, game, player);
      case "leave": return leave(client, game, player);
      case "start": return start(client, game, player);
    }
  });
}
