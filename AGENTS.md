# AGENTS.md

Instructions for the coding agent working on this repository. Read this file and `README.md` fully before changing anything.

## Goal

Build a Telegram bot that lets people play **Big 2** and **Dominoes** in a group chat, working like the Telegram UNO bot `@play_unobot`:

- `@yourbot` (inline mode) starts or joins a game.
- A **Show cards** button opens the player's private hand as an inline list of stickers.
- Tapping a sticker plays that card, tile or hand.
- Works in groups, on all Telegram clients, with **2 to 4 players** (a game must work with exactly 2 players).

## Tech stack (do not change without asking)

- Node.js 20+, TypeScript (strict mode)
- grammY for the Telegram bot
- Neon Postgres for game state (use a serverless-friendly driver)
- Vercel serverless function at `api/webhook.ts` for production
- Local development with long polling (`scripts/dev.ts`)
- `sharp` only if image processing is needed

## Hard rules

1. **No automated tests.** Do not create unit tests, integration tests, test files, or a test framework. If the app runs and the games play correctly by hand, that is enough. Verify your work by running the bot and playing.
2. **Never commit secrets.** Tokens and connection strings live in `.env` (git-ignored). Provide `.env.example` with empty values.
3. **The server is the authority.** Never trust the client. On every move, load the game from the database and validate the move against the rules before applying it. Reject moves made out of turn.
4. **Stickers are created in Phase 1 and then left alone.** Once the owner approves the sticker set, do not rename, regenerate or overwrite the files in `assets/stickers/`. Use the file names exactly as described in `README.md`.
5. **No real money, payments or gambling features.**
6. Keep all player-facing text in one place (`src/render.ts` or a `strings.ts`) so it is easy to translate later. English for now.
7. Do not add features that were not requested. If something is unclear, make the simplest reasonable choice and note it in `README.md`.

## Work in three phases

### Phase 1: Create the stickers (do this first, before any bot code)
The sticker images do **not** exist yet. Create them now and save them in `assets/stickers/cards/` and `assets/stickers/dominoes/`, using the file names from `README.md`.

Use this method, so that every rank, suit and dot count is exactly right:

1. **Generate only the base artwork with the built-in image generation tool**, in one consistent style (default: flat design, deep blue and gold, clean and easy to read on a phone). Save these as PNG files in `assets/art/`:
   - `card-face.png`: a blank playing-card face with a decorative border. No rank, no suit, no text, no symbols.
   - `domino-face.png`: a blank horizontal domino tile with a centre divider line. No dots.
   Do **not** ask the image tool to draw ranks, suits or dots. Image models often get those wrong.
2. **Write `scripts/build-stickers.ts` (using `sharp`)** that takes the base artwork and draws on top of it, with code:
   - the rank letters and suit symbols for all 52 cards (red for hearts and diamonds, black for clubs and spades),
   - the correct dot pattern for all 28 dominoes (0-0 to 6-6),
   then rounds the corners with a transparent mask, resizes each image to 512 px on the longest side (cards are portrait, dominoes are landscape), and exports WebP files under 512 KB.
   Output: 52 card faces and 28 domino faces. There are no card backs or tile backs.
3. **Check the result by eye.** Build a contact sheet (one image showing all stickers in a grid), open it, and confirm that every card and tile is present, correct and readable. Fix and rebuild if anything is wrong.
4. **Image generation uses the owner's plan quota.** Generate only the few base images, retry sparingly, and do not generate the 80 stickers one by one with the image tool.
5. If the image generation tool is not available in this environment, stop and tell the owner. Do not download artwork from the internet.

Show the owner the contact sheet and wait for approval before moving on to Phase 2.

### Phase 2: Develop end to end
1. Project setup, TypeScript config, scripts listed in `README.md`.
2. Database schema and `db:migrate`.
3. Game engines (pure functions, no Telegram code inside): `src/games/big2/` and `src/games/dominoes/`.
4. Lobby: create, join, leave, start.
5. Inline mode and the table message.
6. Sticker upload script (`scripts/upload-stickers.ts`).
7. Local polling runner and manual play-through of both games with two accounts.

### Phase 3: Deploy
1. `api/webhook.ts` for Vercel, with secret token verification.
2. `scripts/set-webhook.ts` and `scripts/delete-webhook.ts`.
3. Document deployment steps in `README.md`.

## Telegram behaviour (how it must work)

### Bot settings the code depends on
Inline mode on, inline feedback at 100%, group joining enabled. The webhook must allow these update types: `message`, `callback_query`, `inline_query`, `chosen_inline_result`.

### Starting a game
- In a group, `@bot` with an empty query returns two results: **New Big 2** and **New Dominoes**. Choosing one posts a lobby message with an inline keyboard: **Join**, **Start**, **Leave**.
- The inline result that creates the lobby must include a `reply_markup` so that `chosen_inline_result` contains an `inline_message_id`. Store it, so the bot can edit the message later.
- Only the host can press **Start**. At least 2 players are required, at most 4.

### The table message
- One message that is **edited** after every move: whose turn it is, the last play (Big 2) or the domino chain (Dominoes), and the number of cards or tiles each player holds.
- It has a **Show cards** button that uses `switch_inline_query_current_chat` (with a short fixed query) so the player's chat box fills with `@bot ` and the list opens.
- Edit by `inline_message_id` when the message was created through inline mode. If the bot posts messages with `chat_id`, edit with `chat_id` and `message_id`.

### Inline query (the hand)
- Always answer with `is_personal: true` and `cache_time: 0`.
- Identify the player by `from.id`. Find their active game from the `user_active_game` table.
- If the user is not in a game, return the "New game" results.
- If it is not their turn, return a single non-sendable informational result (for example "Not your turn, wait for X").
- If it is their turn, return **only legal plays** as `InlineQueryResultCachedSticker` items, strongest or most useful first, **capped at 50 results**. Add a **Pass** result in Big 2 (when passing is allowed) and a **Draw** result in Dominoes (when drawing is allowed). These two are plain text results (`InlineQueryResultArticle`), not stickers.
- Each result id encodes the move, for example `b2:<gameId>:<moveCode>`. Result ids have a small length limit (check the Bot API docs), so keep them short, and keep the move code derived from the game state, never trust it blindly.

### Chosen inline result (the move)
- `chosen_inline_result` has no chat id. Look up the game with the result id or `user_active_game`.
- Validate and apply the move inside a database transaction with a row lock on the game (`SELECT ... FOR UPDATE`), because webhook calls can overlap.
- After applying, edit the table message and announce a winner if the game ended.
- If the move is invalid (for example a stale list), ignore it and re-send the table message without changes.

### Rules about players
- A user can be in only one active game at a time. Joining a second game while in one must be refused with a clear message.
- Games with no activity for a long time should be marked abandoned (a simple timestamp check when someone interacts is enough, no background job needed).

## Data model (suggested)

- `games`: id, type (`big2` or `dominoes`), status (`lobby`, `playing`, `finished`, `abandoned`), host_user_id, state (JSONB), inline_message_id, chat info if known, created_at, updated_at.
- `game_players`: game_id, user_id, display name, seat order.
- `user_active_game`: user_id (primary key), game_id.
- `stickers`: set_name, key (for example `3D` or `4-6`), file_id.

Hands are private. Only store them inside the game `state` and never put them in a message.

## Big 2 rules

- 52 cards, no jokers. 2 to 4 players.
- Deal **13 cards to each player**. With fewer than 4 players the remaining cards are not used.
- **Rank order (low to high):** 3 4 5 6 7 8 9 10 J Q K A 2.
- **Suit order (low to high):** diamonds, clubs, hearts, spades. Suit breaks ties between equal ranks.
- The player holding the **3 of diamonds** starts, and the first play must include it.

### Allowed plays
- **Single:** one card. Compare by rank, then suit.
- **Pair:** two cards of the same rank. Compare by rank, then by the higher suit in the pair.
- **Triple:** three cards of the same rank. Compare by rank.
- **Five-card hands**, lowest to highest category:
  1. **Straight:** five consecutive ranks, no wrapping, using the rank order above (for example 3-4-5-6-7 up to 10-J-Q-K-A). Compare by the highest card (rank, then suit).
  2. **Flush:** five cards of one suit. Compare by the highest card (rank, then suit).
  3. **Full house:** a triple plus a pair. Compare by the rank of the triple.
  4. **Four of a kind + one card.** Compare by the rank of the four.
  5. **Straight flush:** a straight in one suit. Compare by the highest card.
- A higher category always beats a lower category.
- No other sizes (for example 4 cards) are allowed.

Keep the straight and flush tie-break rules in one constants file so they are easy to change.

### Turn flow
- A play must be the same type and size as the previous play, and higher (five-card hands are compared by category first).
- A player may **pass** instead of playing (not allowed when starting a new round of play, because someone must lead).
- After a pass, that player may not play again until the round of play ends.
- When everyone else has passed, the player who made the last play **leads a new round** and may play any legal hand.
- The first player to empty their hand wins.

## Dominoes rules

- Double-six set: 28 tiles, from 0-0 to 6-6.
- **2 players:** 7 tiles each, 14 tiles stay in the **boneyard**. **3 players:** 7 each, 7 in the boneyard. **4 players:** 7 each, boneyard empty.
- **Who starts:** the player with the highest double. If nobody has a double, the player with the tile with the highest pip total starts. The first tile is placed in the middle.
- On their turn a player must place a tile that matches one of the two open ends of the chain. A double is placed as a normal tile (no spinner rules).
- If the player has no matching tile, they **draw from the boneyard** until they can play. If the boneyard is empty, they **pass**.
- If a tile can go on either end, the player chooses the end. The inline list shows **two results** for that tile (left end and right end).
- **A player wins** by playing their last tile.
- **Blocked game:** if every player must pass in a row, the game ends and the player with the lowest total pips left in hand wins (a tie is a draw).
- Show the chain in the table message as text, for example `[6|4][4|4][4|1]`, and show the open ends.

## Sticker upload script

`scripts/upload-stickers.ts`:
- Creates one sticker pack for cards and one for dominoes with `createNewStickerSet`. Pack names must end with `_by_<bot username>`.
- Assigns an emoji to each sticker.
- Reads the pack back with `getStickerSet` and stores each sticker's `file_id` in the `stickers` table, keyed by its name (`3D`, `4-6`).
- Is safe to run again (skip existing, add missing).
- Check the Bot API docs for the current sticker requirements before writing it.

## Code style

- TypeScript strict, small files, no giant functions.
- Game engines are **pure** (state in, state out) and know nothing about Telegram or the database.
- Handle errors without crashing: log them, and answer the Telegram request anyway.
- Comments only where the reason for something is not obvious.

## Definition of done

- A full 2-player game of Big 2 and a full 2-player game of Dominoes can be played in a group chat from start to winner, using inline mode and stickers.
- 3 and 4 player games also work.
- The bot runs locally (polling) and on Vercel (webhook).
- `README.md` matches what was built.
- No secrets in the repository, and no automated tests were added.
