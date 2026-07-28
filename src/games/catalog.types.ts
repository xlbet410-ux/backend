export type GameCategory =
  | "slots"
  | "live-games"
  | "sports"
  | "esports"
  | "mini-game"
  | "fish-catch"
  | "table-games"
  | "arcade"
  | "other";

export const GAME_CATEGORIES: GameCategory[] = [
  "slots",
  "live-games",
  "sports",
  "esports",
  "mini-game",
  "fish-catch",
  "table-games",
  "arcade",
  "other",
];

export type CatalogGame = {
  name: string;
  gameUid: string;
  providerCode: string;
  providerName: string;
  category: GameCategory;
  thumbnail: string;
  original: string;
};
