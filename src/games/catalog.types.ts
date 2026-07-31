export type GameCategory =
  | "featured"
  | "slots"
  | "live_casino"
  | "cards"
  | "fishing"
  | "mini_games"
  | "sports";

export const GAME_CATEGORIES: GameCategory[] = [
  "featured",
  "slots",
  "live_casino",
  "cards",
  "fishing",
  "mini_games",
  "sports",
];

// Real, verifiable sub-tags only — a game gets one of these solely when its
// own name contains the word. There is no Oracle data for reel count,
// Megaways/Bonus-Buy mechanics, or feature flags, so this list intentionally
// stays small rather than guessing.
export type SubTag = "megaways" | "jackpot";
export const SUB_TAGS: SubTag[] = ["megaways", "jackpot"];

export type CatalogGame = {
  name: string;
  gameUid: string;
  providerCode: string;
  providerName: string;
  category: GameCategory;
  // Whether this game is one of the platform's real most-played titles
  // (computed from actual GameTransaction history, not a fixed value on
  // the game itself) — used only to answer the "featured" category query.
  featured: boolean;
  subTags: SubTag[];
  thumbnail: string;
  original: string;
};
