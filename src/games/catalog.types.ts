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
  thumbnail: string;
  original: string;
};
