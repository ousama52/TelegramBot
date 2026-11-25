# Card & Tile Games Bot for Telegram (Big 2 and Dominoes)

A Telegram bot that lets friends play **Big 2** and **Dominoes** inside a group chat. It works the same way as the Telegram UNO bot `@play_unobot`:

- Type `@yourbot` in a group to start or join a game.
- Press **Show cards** to open your private hand as a list of stickers.
- Tap a sticker to play it. Only you see your hand. Everyone sees the table.

It uses Telegram **inline mode** and supports **2 to 4 players** per game.

## Games

| Game | Players | Summary |
|---|---|---|
| Big 2 | 2-4 | Shed all your cards first. Beat the last play with the same type of hand. |
| Dominoes | 2-4 | Double-six set. Match the ends of the chain and empty your hand first. |

Full rules are in `AGENTS.md`.

## How a game looks to players

1. Someone adds the bot to a group.
2. A player types `@yourbot` and picks **New Big 2** or **New Dominoes**.
3. The selection posts a lobby message with **Join**, **Start** and **Leave** buttons. The player who opened the lobby is the host and has already joined.
4. The host presses **Start** once at least 2 players have joined.
5. The lobby becomes the table, with the current turn, last play or domino chain, hand counts, and a **Show cards** button.
6. On your turn, press **Show cards** and choose a legal move. Single cards and tiles with one legal placement appear as stickers. Big 2 combinations list their cards, and tiles with two legal placements list the left and right ends.
7. The table announces the winner or a blocked-game draw.

### Practice against the CPU

Open the bot in Telegram, send `/start`, tap **Play CPU**, and choose **Big 2 vs CPU** or **Dominoes vs CPU**. You can also type `@yourbot cpu` in a group to start a solo game there. Practice starts as soon as you select a game.

Use **Show cards** to play. The CPU takes its turns automatically using the same rules, choosing the strongest legal Big 2 play or a matching domino with the highest pip total. If it cannot place a tile, it draws or passes as the rules allow. Tap **End practice** to leave early and free your seat for another game.

## Tech stack

- Node.js 20+ with TypeScript
- [grammY](https://grammy.dev) (Telegram bot framework)
- Neon (serverless Postgres) for game state
- Vercel for the production webhook
- `sharp` for any image processing

## Project structure

```
.
├── README.md
├── AGENTS.md                 # Instructions for the coding agent
├── .env.example
├── package.json
├── vercel.json                # production build and function region
├── api/
│   └── webhook.ts            # authenticated Telegram updates on Vercel
├── db/
│   └── schema.sql            # games, players, active seats and sticker IDs
├── src/
│   ├── bot.ts                # grammY bot setup and handlers
│   ├── games/
│   │   ├── big2/             # Big 2 rules, hand evaluation, legal plays
│   │   └── dominoes/         # Dominoes rules, legal plays
│   ├── lobby.ts              # create, join, start, leave
│   ├── inline.ts             # inline_query and chosen_inline_result handling
│   ├── render.ts             # table and lobby message text
│   ├── db.ts                 # Neon connection and transactions
│   ├── game-store.ts         # game records, row locks and active seats
│   └── stickers.ts           # file_id lookup
├── scripts/
│   ├── build-stickers.ts     # draws ranks, suits and dots on the base art, exports WebP
│   ├── delete-webhook.ts     # switch the bot back to polling
│   ├── migrate.ts            # applies the database schema in Neon
│   ├── set-webhook.ts        # register the deployed endpoint with Telegram
│   ├── upload-stickers.ts    # one-time: create sticker packs, save file_ids
│   └── dev.ts                # local long-polling runner
└── assets/
    ├── art/                  # AI-generated base artwork (blank card face, blank domino tile)
    ├── sticker-contact-sheet.png  # Phase 1 preview of all 80 stickers
    └── stickers/
        ├── cards/            # 52 card faces (512 px WebP, transparent)
        └── dominoes/         # 28 domino faces (512 px WebP, transparent)
```

## Sticker files

The stickers are created first, before any bot code, and live in `assets/stickers/`. The base artwork (a blank card face and a blank domino tile) is generated with an AI image tool and saved in `assets/art/`. A script (`npm run stickers:build`) then draws the exact ranks, suits and domino dots on top with code, so no card or tile is ever wrong, and exports the final files. Do not rename the files once they are approved.

- Size: 512 px on the longest side, transparent background, WebP (or PNG), under 512 KB each. Check the current Telegram sticker limits in the Bot API docs.
- Cards: `{rank}{suit}.webp`
  - Ranks: `3 4 5 6 7 8 9 T J Q K A 2`
  - Suits: `D` diamonds, `C` clubs, `H` hearts, `S` spades
  - Examples: `3D.webp`, `TH.webp`, `2S.webp`
- Dominoes: `{low}-{high}.webp`
  - Examples: `0-0.webp`, `3-5.webp`, `6-6.webp`

The card faces display `10` for rank `T`. Domino tiles show the lower pip count on the left.

### Sticker artwork

The [contact sheet](assets/sticker-contact-sheet.png) shows all 52 cards and 28 dominoes. The approved WebP files can be uploaded as-is. The blank base art and [bot avatar](assets/art/avatar.png) are in `assets/art/`.

## Setup

### 1. Create the bot in BotFather

In Telegram, open `@BotFather` and send:

1. `/newbot` and follow the steps. Copy the token.
2. `/setinline` and choose your bot. Set a placeholder such as "Show your cards".
3. `/setinlinefeedback` and choose your bot. Set it to **100%**. Without this, the bot is not told which result a player picked.
4. `/setjoingroups` and make sure it is **Enabled**.

### 2. Environment variables

Copy `.env.example` to `.env`, then fill in the four local settings. Get the database URL from **Connect** in your Neon project.

```
BOT_TOKEN=             # from BotFather
BOT_USERNAME=          # without the @
BOT_OWNER_ID=          # your Telegram user id, owns the sticker packs
DATABASE_URL=          # Neon connection string
WEBHOOK_SECRET=        # shared secret for the Vercel webhook
WEBHOOK_URL=           # public HTTPS production URL ending in /api/webhook
```

Never commit `.env`. It is listed in `.gitignore`.

### 3. Install and run locally

```sh
npm ci
npm run db:migrate         # create tables in Neon
npm run stickers:upload    # upload missing stickers and record file IDs
npm run dev                # local long polling (no webhook set)
```

The bot verifies its username against Telegram and expects both sticker packs before polling. The upload command can be run again to add missing stickers or refresh file IDs. To return to polling from a production deployment, run `npm run webhook:delete` before `npm run dev`. This preserves pending updates.

Use **two Telegram accounts** in a group. Start each game through inline mode, join with the second account, and play to a winner or a Dominoes draw. Check that a non-host cannot start, the waiting player sees a status message, and an old move selection leaves the table state unchanged.

### 4. Deploy to Vercel

1. Run the Neon migration and sticker upload against the database the deployment will use.
2. Run `vercel link` to select the project. In its **Production** environment, set `BOT_USERNAME` and add `BOT_TOKEN`, `DATABASE_URL` and `WEBHOOK_SECRET` as sensitive variables. Use a randomly generated secret, such as 32 bytes encoded as hex, and put the same value in your local `.env`.
3. Run `vercel deploy --prod`. Set `WEBHOOK_URL` in your local `.env` to the production domain plus `/api/webhook`. The endpoint must be reachable by Telegram over public HTTPS.
4. Stop any local polling process, then run `npm run webhook:set`. The script checks that Telegram has registered the URL and all four update types.
5. Send `/start` to the bot in Telegram. Then open the bot inline in a group and pick a game to check that chosen-result feedback reaches the webhook.

### 5. Replace an exposed bot token

In BotFather, send `/revoke` and choose your bot. Update `BOT_TOKEN` in your local `.env` and in Vercel, redeploy, and run `npm run webhook:set` again. The bot retains its username and sticker packs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run locally with long polling |
| `npm run db:migrate` | Create or update database tables |
| `npm run stickers:build` | Phase 1 source command for generating draft WebP stickers before approval |
| `npm run stickers:upload` | Create sticker packs and save sticker file_ids |
| `npm run webhook:set` | Register the production endpoint, secret and update types |
| `npm run webhook:delete` | Remove the webhook and preserve pending updates |
| `npm run build` | Type-check and build |

## Known Telegram limits to keep in mind

- An inline answer holds at most 50 results per page. Big 2 lists larger hands first when leading and stronger hands first within a size.
- The bot only learns which result was chosen if inline feedback is set to 100%.
- Telegram cached-sticker results have no title field. The bot uses labeled articles for full Big 2 hands and for tiles with two legal placements. When it is another player's turn, it shows an informational button above an empty result list.
- Telegram sends an inline selection to the chosen chat before notifying the bot. Move selections send a generic receipt. A database transaction checks the player's seat, turn, game version and rules before the table reveals the accepted play.
- Inline queries and chosen-result updates do not provide the group ID. The bot scopes moves to the player's active game. The original table is updated even if a player opens inline mode in another group.

## Rules and lobby defaults

- A player can join one game at a time. If a host leaves before starting, the earliest remaining player becomes host. Games expire after 24 hours without activity, checked when someone interacts.
- Big 2 deals 13 cards each and always deals the 3♦ to a player. Straights run from 3–4–5–6–7 through 10–J–Q–K–A.
- Dominoes opens with the highest double in a player's hand. If no player has a double, the highest pip total opens, with the higher side breaking ties. **Draw** takes tiles up to the first playable one. If the boneyard runs out first, the player can then pass.

## Playing money

This bot uses no real money or payments. Keep it that way.
