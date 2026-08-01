export type GameCategory =
  | 'featured'
  | 'slots'
  | 'live_casino'
  | 'cards'
  | 'fishing'
  | 'mini_games'
  | 'sports'
  | 'esports';

export const GAME_CATEGORIES: GameCategory[] = [
  'featured',
  'slots',
  'live_casino',
  'cards',
  'fishing',
  'mini_games',
  'sports',
  'esports',
];

// Real, verifiable sub-tags only. "megaways"/"jackpot" come from a literal
// name match (Oracle has no mechanic-flag data); the rest come straight from
// Oracle's own per-game raw category, so they only ever appear on games in
// the category that raw value already maps to — e.g. table_games/video_poker
// only show up within Cards, crash_games/arcade/bingo/scratches only within
// Mini Games. There's no data for reel count, Bonus Buy, Free Spins, Respins,
// Cascade Slots, or Cricket-as-a-slot-feature, so those aren't included.
export type SubTag =
  | 'megaways'
  | 'jackpot'
  | 'table_games'
  | 'video_poker'
  | 'crash_games'
  | 'arcade'
  | 'bingo'
  | 'scratches';
export const SUB_TAGS: SubTag[] = [
  'megaways',
  'jackpot',
  'table_games',
  'video_poker',
  'crash_games',
  'arcade',
  'bingo',
  'scratches',
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
  subTags: SubTag[];
  thumbnail: string;
  original: string;
};
