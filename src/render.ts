import type { InlineKeyboardMarkup, InlineQueryResultsButton } from "grammy/types";
import { CPU_PLAYER_ID, cpuSeat, MAX_PLAYERS, type Game, type GameMode, type GameType, type Player } from "./game.js";
import { cardKey, type Card } from "./games/big2/cards.js";
import type { Score } from "./games/big2/hands.js";
import { ends, tileKey, type Side } from "./games/dominoes/index.js";
import type { LobbyReply } from "./lobby.js";

export const handQuery = "hand";
export const cpuQuery = "cpu";
export const practiceMenuKeyboard: InlineKeyboardMarkup = {
  inline_keyboard: [[{ text: "Play CPU", switch_inline_query_current_chat: cpuQuery }]],
};
export const lobbyKeyboard: InlineKeyboardMarkup = {
  inline_keyboard: [[
    { text: "Join", callback_data: "lobby:join" },
    { text: "Start", callback_data: "lobby:start" },
    { text: "Leave", callback_data: "lobby:leave" },
  ]],
};
export const receiptKeyboard: InlineKeyboardMarkup = {
  inline_keyboard: [[{ text: "Move status", callback_data: "move:receipt" }]],
};
const showHandButton = { text: "Show cards", switch_inline_query_current_chat: handQuery };
const endPracticeButton = { text: "End practice", callback_data: "lobby:end-practice" };
const handKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[showHandButton]] };
const practiceKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[showHandButton, endPracticeButton]] };
export const practiceStartKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[endPracticeButton]] };
export const noKeyboard: InlineKeyboardMarkup = { inline_keyboard: [] };

const titles: Record<GameType, string> = { big2: "Big 2", dominoes: "Dominoes" };
const practiceTitle = (type: GameType) => `${titles[type]} vs CPU`;
const suits: Record<string, string> = { D: "♦", C: "♣", H: "♥", S: "♠" };
const fiveCardNames = ["", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
const sides: Record<Side, string> = { first: "Start chain", left: "Left end", right: "Right end" };

export const strings = {
  chatOnly: "Open the bot in a group or private chat to play.",
  groupOnly: "Open Show cards on your group game table.",
  unavailable: "The game is temporarily unavailable. Try again.",
  noActiveGame: "You are between games.",
  lobbyWaiting: "Waiting for the host to start.",
  lobbyPosting: "Opening the game…",
  lobbyBusy: "You’re already in a game. Leave its lobby, end practice, or finish the game before starting another.",
  movePending: "Move submitted…",
  moveAccepted: "Move played.",
  moveStale: "This move expired. Open Show cards again to see the current choices.",
  pass: "Pass",
  draw: "Draw",
  showHelp: (username: string) =>
    `Play Big 2 and Dominoes with 2 to 4 players. Type @${username} in a group to start or join.`,
  practiceHelp: "Tap Play CPU to practice Big 2 or Dominoes on your own.",
  waitingFor: (name: string) => `Not your turn. Waiting for ${name}.`,
  yourTurn: "It’s your turn. Open Show cards on your game table.",
  newGameTitle: (type: GameType, mode: GameMode) => mode === "cpu" ? practiceTitle(type) : `New ${titles[type]}`,
  newGameMessage: (type: GameType, mode: GameMode) => mode === "cpu"
    ? `${practiceTitle(type)}\nStarting practice…`
    : `${titles[type]}\nOpening the lobby…`,
} as const;

export const lobbyReplies: Record<LobbyReply, string> = {
  joined: "You joined the game.",
  alreadyJoined: "You’re already in this lobby.",
  busy: strings.lobbyBusy,
  full: "This lobby is full.",
  left: "You left the lobby.",
  notJoined: "You aren’t in this lobby.",
  started: "Game started.",
  hostOnly: "Only the host can start the game.",
  needPlayers: "At least two players are needed.",
  closed: "This lobby is closed.",
  pending: strings.lobbyPosting,
  practiceEnded: "Practice ended.",
  practiceHostOnly: "Only the player who started this practice can end it.",
};

export function inlineNotice(text: string): InlineQueryResultsButton {
  return { text, start_parameter: "status" };
}

const playerName = (name: string) => name.replace(/[\p{Cc}\s]+/gu, " ").trim().slice(0, 48) || "Player";
export const nameOf = (player: Player) => player.id === CPU_PLAYER_ID ? "CPU" : playerName(player.name);
const playerAt = (game: Game, index: number) => nameOf(game.players[index]);

export function cardLabels(cards: readonly Card[]): string {
  return cards.map((card) => {
    const [rank, suit] = cardKey(card);
    return (rank === "T" ? "10" : rank) + suits[suit];
  }).join(" ");
}

export function handTitle(score: Score, cards: readonly Card[]): string {
  const name = score.size === 5 ? fiveCardNames[score.category] : score.size === 3 ? "Triple" : "Pair";
  return `${name} · ${cardLabels(cards)}`;
}

export const tileTitle = (key: string, side: Side) => `${key.replace("-", " | ")} · ${sides[side]}`;

function lobbyText(game: Game): string {
  const names = game.players.map((player) => player.id === game.hostId ? `${nameOf(player)} (host)` : nameOf(player));
  return [`${titles[game.type]} lobby`, `Players (${names.length}/${MAX_PLAYERS})`, ...names].join("\n");
}

function outcomeLine(game: Game): string {
  const outcome = game.state?.outcome;
  if (!outcome) return "";
  return outcome.winner === null ? "Draw. The lowest pip total was tied." : `Winner: ${playerAt(game, outcome.winner)}`;
}

function lastAction(game: Game): string {
  const state = game.state;
  if (!state?.action) return "";
  const { player, kind } = state.action;
  const name = playerAt(game, player);
  if (kind === "pass") return `${name} passed.`;
  if (state.type === "dominoes" && state.action.kind === "draw") {
    const count = state.action.count;
    return `${name} drew ${count} ${count === 1 ? "tile" : "tiles"}.`;
  }
  if (state.type === "dominoes" && state.action.kind === "place") {
    return `${name} placed ${tileTitle(tileKey(state.action.tile), state.action.side)}.`;
  }
  return "";
}

function gameDetails(game: Game): string[] {
  const state = game.state;
  if (!state) return [];
  if (state.type === "big2") {
    const last = state.lastPlay;
    return last
      ? [`Last play: ${playerAt(game, last.player)} · ${cardLabels(last.cards)}`,
        state.leading ? "New round. Lead with any legal hand." : ""]
      : ["Opening play must include 3♦."];
  }

  const open = ends(state.chain);
  return [
    open ? `Chain: ${state.chain.map(([left, right]) => `[${left}|${right}]`).join("")}` : "Chain: empty",
    open ? `Open ends: ${open[0]} left · ${open[1]} right` : "Open with the highest double or highest pip total.",
    `Boneyard: ${state.boneyard.length}`,
  ];
}

export function table(game: Game): { text: string; keyboard: InlineKeyboardMarkup } {
  if (game.status === "lobby") return { text: lobbyText(game), keyboard: lobbyKeyboard };
  const practice = cpuSeat(game.players) !== -1;
  const title = practice ? practiceTitle(game.type) : titles[game.type];
  if (game.status === "abandoned") {
    const message = practice ? lobbyReplies.practiceEnded : "This game has been closed.";
    return { text: `${title}\n${message}`, keyboard: noKeyboard };
  }
  const state = game.state;
  if (!state) throw new Error("A started game must have state.");
  const counts = state.hands.map((hand, seat) => {
    const unit = state.type === "big2" ? (hand.length === 1 ? "card" : "cards") : (hand.length === 1 ? "tile" : "tiles");
    return `${playerAt(game, seat)}: ${hand.length} ${unit}`;
  });
  const status = outcomeLine(game) || `Turn: ${playerAt(game, state.turn)}`;
  const summary = [title, status, ...gameDetails(game), lastAction(game)].filter(Boolean);
  return {
    text: [...summary, "", ...counts].join("\n"),
    keyboard: game.status === "playing" ? (practice ? practiceKeyboard : handKeyboard) : noKeyboard,
  };
}

export function currentStatus(game: Game | null, userId: number): string {
  if (!game) return strings.noActiveGame;
  if (!game.state) return strings.lobbyWaiting;
  const player = game.players[game.state.turn];
  return player.id === userId ? strings.yourTurn : strings.waitingFor(nameOf(player));
}
