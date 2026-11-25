import type { Database } from "./db.js";
import { SetupError } from "./errors.js";
import type { GameType } from "./game.js";
import { cardKey, DECK } from "./games/big2/cards.js";
import { tileKey, TILES } from "./games/dominoes/index.js";

export type StickerPack = { directory: string; name: string; title: string; keys: string[] };
export type StickerCatalog = Record<GameType, ReadonlyMap<string, string>>;

export function stickerPacks(username: string): Record<GameType, StickerPack> {
  const suffix = `_by_${username.toLowerCase()}`;
  return {
    big2: { directory: "cards", name: "big2_cards" + suffix, title: "Big 2 Cards", keys: DECK.map(cardKey) },
    dominoes: { directory: "dominoes", name: "domino_tiles" + suffix, title: "Domino Tiles", keys: TILES.map(tileKey) },
  };
}

export async function loadStickers(db: Database, username: string): Promise<StickerCatalog> {
  const packs = stickerPacks(username);
  const result = await db.pool.query<{ set_name: string; key: string; file_id: string }>(
    "SELECT set_name, key, file_id FROM stickers WHERE set_name = ANY($1::text[])",
    [Object.values(packs).map(({ name }) => name)],
  );
  const catalog = { big2: new Map<string, string>(), dominoes: new Map<string, string>() };
  for (const type of ["big2", "dominoes"] as const) {
    const pack = packs[type];
    for (const row of result.rows.filter(({ set_name }) => set_name === pack.name)) {
      catalog[type].set(row.key, row.file_id);
    }
    if (pack.keys.some((key) => !catalog[type].has(key))) {
      throw new SetupError(`Sticker pack ${pack.name} is incomplete. Run npm run stickers:upload.`);
    }
  }
  return catalog;
}
