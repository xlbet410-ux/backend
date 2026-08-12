import { GameCategory, SubTag } from './catalog.types';

const RAW_CATEGORY_TO_SUB_TAG: Record<string, SubTag> = {
  Table: 'table_games',
  Card: 'table_games',
  Casino: 'table_games',
  Roulette: 'table_games',
  BlackJack: 'table_games',
  Baccarat: 'table_games',
  'Hundred-player': 'table_games',
  Poker: 'video_poker',
  Crash: 'crash_games',
  Arcade: 'arcade',
  Bingo: 'bingo',
  Scratch: 'scratches',
  'Scratch cards': 'scratches',
};

// A game only gets a sub-tag when there's real, verifiable evidence for it:
// either its own name literally contains the word (Megaways/Jackpot — Oracle
// has no mechanic-flag data to check instead), or Oracle's own raw category
// for that game maps to one directly. No guessing.
export function computeSubTags(
  name: string,
  rawCategory: string | null | undefined,
): SubTag[] {
  const key = name.toLowerCase();
  const tags: SubTag[] = [];
  if (key.includes('megaways')) tags.push('megaways');
  if (key.includes('jackpot')) tags.push('jackpot');
  const fromRaw = rawCategory
    ? RAW_CATEGORY_TO_SUB_TAG[rawCategory.trim()]
    : undefined;
  if (fromRaw) tags.push(fromRaw);
  return tags;
}

// Oracle tags every individual game with its own category (e.g. "Slot",
// "Fish", "Crash", "Table"). Verified against live API responses by
// spot-checking real game names per bucket — e.g. JILI's "Casino" category
// is Poker King/Dragon & Tiger/Baccarat (cards), and V8's "Hundred-player"
// is Baccarat/SicBo/Tai Xiu variants (also cards). "Cockfighting"/"Animal"
// fold into Sports — AOG's "Animal"-tagged games are literally cockfighting
// titles (e.g. "COCKFIGHT03").
const RAW_CATEGORY_MAP: Record<string, GameCategory> = {
  Slot: 'slots',

  'Casino Live': 'live_casino',
  'Game Shows': 'live_casino',

  Table: 'cards',
  Card: 'cards',
  Poker: 'cards',
  Roulette: 'cards',
  BlackJack: 'cards',
  Baccarat: 'cards',
  Casino: 'cards',
  'Hundred-player': 'cards',

  Fish: 'fishing',

  Arcade: 'mini_games',
  Crash: 'mini_games',
  Instant: 'mini_games',
  Mini: 'mini_games',
  Plinko: 'mini_games',
  Mines: 'mini_games',
  Dice: 'mini_games',
  'HI-LO': 'mini_games',
  Keno: 'mini_games',
  Scratch: 'mini_games',
  'Scratch cards': 'mini_games',
  Tower: 'mini_games',
  'Wheel of Fortune': 'mini_games',
  Lottery: 'mini_games',
  Marbles: 'mini_games',
  Casual: 'mini_games',
  Multiplayer: 'mini_games',

  Sports: 'sports',
  Esports: 'esports',
  // Cockfighting/animal-fighting games route to the Esports bucket (a
  // catch-all for niche/regional betting products), not Live Sports.
  Cockfighting: 'esports',
  Animal: 'esports',
};

// Explicit provider-level split for the sportsbook aggregators. Oracle tags
// most of a sportsbook provider's own games generically "Sports" regardless
// of what the provider actually specializes in, so raw category can't tell
// these apart from the mainstream sportsbooks — this overrides both the raw
// category and CODE_CATEGORY_FALLBACK above for exactly these codes.
//
// Live Sports (`sports`) is kept to just the operator-picked mainstream
// sportsbooks — everything else that used to land in Sports (regional
// books, horse-racing-heavy providers like TOPBET, CyberBetX, and the
// rest) is folded into `esports` instead, a single catch-all "everything
// else" section (no more separate EA Sports tab).
export const SPORTS_ESPORTS_PROVIDER_OVERRIDE: Record<
  string,
  'sports' | 'esports'
> = {
  SABA: 'sports',
  UG: 'sports',
  BTI: 'sports',
  SBO: 'sports',
  BETBY: 'sports',
  LUCKSPORT: 'esports',
  CMD: 'esports',
  DP: 'esports',
  TOPBET: 'esports',
  VPLUS: 'esports',
  WYNSOSPORTS: 'esports',
  PSG: 'esports',
  RECTANGLE: 'esports',
  KOOLBET: 'esports',
  CYBERBETX: 'esports',
};

// Fallback only for games with a missing/unrecognized category — e.g.
// 18Peaches has null-category games that are actually slots. Keyed by
// provider code (stable) rather than name (varies in casing/spelling).
// Only slots/live_casino/sports show up here: every other bucket
// (cards/fishing/mini_games) is reliably tagged per-game by Oracle, so a
// provider-level guess for those would rarely fire and risks being wrong.
const CODE_CATEGORY_FALLBACK: Record<string, GameCategory> = {
  // ---------- LIVE CASINO (live dealer) ----------
  YEEBET: 'live_casino',
  WM: 'live_casino',
  AG: 'live_casino',
  ON: 'live_casino',
  SA: 'live_casino',
  SEXY: 'live_casino',
  PPLIVE: 'live_casino',
  DREAM: 'live_casino',
  EVOASIA: 'live_casino',
  EVOLIVEROW: 'live_casino',
  EVOBTGROW: 'live_casino',
  EVOBNLCROW: 'live_casino',
  EVOREDTIGERROW: 'live_casino',
  EZUGI: 'live_casino',
  BG: 'live_casino',
  BIGGAMING: 'live_casino',
  VIVO: 'live_casino',
  CREEDROOMZ: 'live_casino',
  WINTOLIVE: 'live_casino',
  ATG: 'live_casino',
  PTASIA: 'live_casino', // Playtech Asia — has live tables
  PLAYTECHEU: 'live_casino',
  GAMINGSOFTAILIVECASINO: 'live_casino',
  ONE: 'live_casino',
  MT: 'live_casino',
  IA: 'live_casino',
  WS168: 'live_casino',
  AURAGAMING: 'live_casino',
  TITIGAMING: 'live_casino',
  BARBARABANG: 'live_casino',
  VELIPLAY: 'live_casino',
  EVO888H5: 'live_casino',
  CASINI: 'live_casino',
  ATM: 'live_casino',
  BT: 'live_casino',
  CP: 'live_casino',

  // ---------- SPORTS (includes esports + cockfight) ----------
  SABA: 'sports',
  UG: 'sports',
  BTI: 'sports',
  SBO: 'sports',
  CMD: 'sports',
  DP: 'sports',
  LUCKSPORT: 'sports',
  WYNSOSPORTS: 'sports',
  '9W': 'sports', // 9 wicket — cricket/sports
  KOOLBET: 'sports',
  BETBY: 'sports',
  VPLUS: 'sports',
  TOPBET: 'sports',
  PSG: 'sports',
  RECTANGLE: 'sports',
  CYBERBETX: 'sports',
  ASTAR: 'sports',
  TF: 'sports',
  DPES: 'sports',
  AOG: 'esports', // cockfighting — verified via real game names (e.g. "COCKFIGHT03")

  // ---------- SLOTS (default for game studios) ----------
  PG: 'slots',
  JL: 'slots',
  JDB: 'slots',
  TADA: 'slots',
  CQ9: 'slots',
  KM: 'slots',
  V8: 'slots',
  FACHAI: 'slots',
  EAZY: 'slots',
  GAMEART: 'slots',
  RELAX: 'slots',
  SKYWIND: 'slots',
  PLAYNGO: 'slots',
  PLAYSON: 'slots',
  T1: 'slots',
  IDEAL: 'slots',
  PGS: 'slots',
  RICH88: 'slots',
  PIX: 'slots',
  NS: 'slots',
  PP: 'slots',
  SPRIBE: 'slots', // crash/arcade — grouped under slots as a last resort
  HABANERO: 'slots',
  MG: 'slots',
  YGR: 'slots',
  HACKSAWASIA: 'slots',
  HACKSAWLATAM: 'slots',
  HACKSAWWORLD: 'slots',
  BNG: 'slots',
  EVOPLAYASIA: 'slots',
  EVOPLAYEU: 'slots',
  '5G': 'slots',
  MINI: 'slots',
  '2J': 'slots',
  EPICWIN: 'slots',
  SMARTSOFT: 'slots',
  WONWON: 'slots',
  GALAXSYS: 'slots',
  EXPANSE: 'slots',
  INOUT: 'slots',
  BNG3OKS: 'slots',
  KY: 'slots',
  RG: 'slots',
  FASTSPIN: 'slots',
  TURBOASIA: 'slots',
  TURBOEU: 'slots',
  '100HP': 'slots',
  ASKMESLOT: 'slots',
  WINTOSLOT: 'slots',
  KA: 'slots',
  CROWDPLAY: 'slots',
  ENDORPHINA: 'slots',
  AMIGO: 'slots',
  RUBYPLAY: 'slots',
  AVIATRIX: 'slots',
  GAMINGSOFTWOW: 'slots',
  LIVE22: 'slots',
  PENGUINKING: 'slots',
  '18PEACHES': 'slots',
  '9GAME': 'slots',
  FUNKYGAMES: 'slots',
  VA: 'slots',
  SG: 'slots',
  JLSWEEP: 'slots',
  YELLOWBAT: 'slots',
  MAC88: 'slots',
  ONLYPLAY: 'slots',
  EEAI: 'slots',
  RICHPARADISE: 'slots',
  ODIN: 'slots',
  '759GAMING': 'slots',
  BETSOFT: 'slots',
  PGSOFT: 'slots',
  NETENTASIA: 'slots',
  NLCASIA: 'slots',
  RTASIA: 'slots',
  BTGASIA: 'slots',
  RICH88_ALT: 'slots',
  CASINO: 'slots',
  WG: 'slots',
};

function categorizeProviderFallback(code: string, name: string): GameCategory {
  const byCode = CODE_CATEGORY_FALLBACK[code.trim().toUpperCase()];
  if (byCode) return byCode;

  const key = name.trim().toLowerCase();
  if (/e-?sport|sport/.test(key)) return 'sports';
  if (/(live|casino|dealer|baccarat|roulette|blackjack)/.test(key))
    return 'live_casino';
  if (/fish/.test(key)) return 'fishing';
  if (/(crash|arcade|mini)/.test(key)) return 'mini_games';
  return 'slots';
}

export function categorizeGame(
  rawCategory: string | null | undefined,
  providerCode: string,
  providerName: string,
): GameCategory {
  if (rawCategory) {
    const hit = RAW_CATEGORY_MAP[rawCategory.trim()];
    if (hit) return hit;
  }
  return categorizeProviderFallback(providerCode, providerName);
}

// Explicit curation: these exact (name, provider) pairs are shown first, in
// this exact order, in the Slots section, replicating a reference design the
// operator asked to match. Matching by name alone isn't enough — several
// providers ship their own same-named clone (e.g. "Aviator", "Super Ace"
// exist under multiple provider codes), which previously pinned every
// provider's copy to the front instead of just the one intended. Two of
// these (Aviator, FlyX*) are Crash-mechanic games that categorizeGame()
// would otherwise route to Mini Games — they're deliberately pinned into
// Slots here, overriding the normal per-game category for just this exact
// (name, provider) pair.
export const PINNED_SLOTS_ORDER: { name: string; providerCode: string }[] = [
  { name: 'Super Ace', providerCode: 'JL' },
  { name: 'Aviator', providerCode: 'SPRIBE' },
  { name: 'Wild Bounty Showdown', providerCode: 'PG' },
  { name: 'Super Elements', providerCode: 'FACHAI' },
  { name: 'Magic Ace WILD LOCK', providerCode: 'JDB' },
  { name: 'Fortune Gems 3', providerCode: 'JL' },
  { name: 'Fortune Garuda 500', providerCode: 'JL' },
  { name: 'FlyX', providerCode: 'MG' },
  { name: 'Circus Joker 4096', providerCode: 'JL' },
  { name: 'Boxing King', providerCode: 'JL' },
  { name: 'Super Ace Deluxe', providerCode: 'JL' },
  { name: 'Super Ace II', providerCode: 'JL' },
  { name: 'Treasures of Aztec', providerCode: 'PG' },
  { name: 'Anubis Wrath', providerCode: 'PG' },
  { name: 'Money Coming', providerCode: 'JL' },
  { name: 'Fortune Gems 2', providerCode: 'JL' },
  { name: 'FlyX Cash Turbo', providerCode: 'MG' },
  { name: 'Pinata Wins', providerCode: 'PG' },
  { name: 'Egypt Power x1000', providerCode: 'BNG' },
  { name: 'Chinese New Year Moreways', providerCode: 'FACHAI' },
];

function pinKey(name: string, providerCode: string): string {
  return `${providerCode.trim().toUpperCase()}::${name.trim().toLowerCase()}`;
}

const PINNED_SLOTS_LOOKUP = new Map(
  PINNED_SLOTS_ORDER.map((p, i) => [pinKey(p.name, p.providerCode), i]),
);

export function pinnedSlotsIndex(
  name: string,
  providerCode: string,
): number | null {
  const idx = PINNED_SLOTS_LOOKUP.get(pinKey(name, providerCode));
  return idx === undefined ? null : idx;
}

// Explicit curation for the "Hot Games" section, from an operator-supplied
// serial list of 35 (name, provider) pairs (replaces an earlier, longer
// list entirely — this is the full set, not an addition to it). Each entry
// was verified against the live catalog's search endpoint before inclusion
// — 3 of the original 35 (Mines/JILI, Mighty Mania/PG, Ice Fishing/
// Evolution) had no confident match under the given provider right now and
// were left out rather than guessed. Unlike PINNED_SLOTS_ORDER, this
// doesn't override a game's normal category — a game can be both e.g. Slots
// and Hot Games at once (see the `hotGames` boolean on CatalogGame, same
// pattern as `featured`).
export const PINNED_HOT_GAMES_ORDER: { name: string; providerCode: string }[] =
  [
    { name: 'Super Ace', providerCode: 'JL' },
    { name: 'Fortune Gems', providerCode: 'JL' },
    { name: 'Money Coming', providerCode: 'JL' },
    { name: 'Crazy777', providerCode: 'JL' },
    { name: 'Aviator', providerCode: 'SPRIBE' },
    { name: 'Wild Bounty Showdown', providerCode: 'PG' },
    { name: 'Dragon Treasure', providerCode: 'JL' },
    { name: 'Dragon Fishing', providerCode: 'JDB' },
    { name: 'Birds Party', providerCode: 'JDB' },
    { name: 'Dragon Master', providerCode: 'JDB' },
    { name: 'Mahjong Ways', providerCode: 'PG' },
    { name: 'Lucky Neko', providerCode: 'PG' },
    { name: 'Dreams of Macau', providerCode: 'PG' },
    { name: 'Mahjong Ways 2', providerCode: 'PG' },
    { name: 'Caishen Wins', providerCode: 'PG' },
    { name: 'Sweet Land', providerCode: 'JL' },
    { name: 'FlyX', providerCode: 'MG' },
    { name: 'SUPER ELEMENTS', providerCode: 'FACHAI' },
    { name: 'Mighty Sevens', providerCode: 'FASTSPIN' },
    { name: 'Fortune Garuda 500', providerCode: 'JL' },
    { name: 'Magic Ace WILD LOCK', providerCode: 'JDB' },
    { name: 'Circus Joker 4096', providerCode: 'JL' },
    { name: 'Fortune Gems 3', providerCode: 'JL' },
    { name: 'Boxing King', providerCode: 'JL' },
    { name: 'Anubis Wrath', providerCode: 'PG' },
    { name: 'Treasures of Aztec', providerCode: 'PG' },
    { name: 'Crazy Time', providerCode: 'EVOASIA' },
    { name: 'CHINESE NEW YEAR MOREWAYS', providerCode: 'FACHAI' },
    { name: 'Pinata Wins', providerCode: 'PG' },
    { name: 'Fruity Bonanza', providerCode: 'JDB' },
    { name: 'Funky Time', providerCode: 'EVOASIA' },
    { name: 'Olympus Rivals', providerCode: 'AMIGO' },
  ];

const PINNED_HOT_GAMES_LOOKUP = new Map(
  PINNED_HOT_GAMES_ORDER.map((p, i) => [pinKey(p.name, p.providerCode), i]),
);

export function pinnedHotGamesIndex(
  name: string,
  providerCode: string,
): number | null {
  const idx = PINNED_HOT_GAMES_LOOKUP.get(pinKey(name, providerCode));
  return idx === undefined ? null : idx;
}

// Same idea as PINNED_SLOTS_ORDER, for Live Casino and Fishing — these
// don't need a category override (the raw Oracle category already puts
// them in the right bucket), just the display order. Some entries list
// more than one providerCode because the operator's reference list named
// a studio (e.g. "Evolution") that Oracle exposes under multiple regional
// codes for the same game; the pin matches whichever one is actually live.
export const PINNED_LIVE_CASINO_ORDER: {
  name: string;
  providerCodes: string[];
}[] = [
  { name: 'Crazy Time', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Funky Time', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Ice Fishing', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Mega Wheel', providerCodes: ['PPLIVE'] },
  { name: 'Bac Bo', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Auto-Roulette', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Crazy Time A', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Fan Tan', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Super Sic Bo', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Sweet Bonanza Candyland', providerCodes: ['PPLIVE'] },
  { name: 'Monopoly Big Baller', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'BACCARAT C08', providerCodes: ['SEXY'] },
  { name: 'Lightning Storm', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Crazy Balls', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Red Door Roulette', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Bac Bo Ao Vivo', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Lightning Dice', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Lightning Roulette', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Monopoly Live', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
  { name: 'Speed Baccarat A', providerCodes: ['EVOASIA', 'EVOLIVEROW'] },
];

export const PINNED_FISHING_ORDER: {
  name: string;
  providerCodes: string[];
}[] = [
  { name: 'Fortune King Jackpot', providerCodes: ['JL'] },
  { name: 'Happy Fishing', providerCodes: ['JL'] },
  { name: 'Jackpot Fishing', providerCodes: ['JL'] },
  { name: 'Jackpot Fishing 2', providerCodes: ['JL'] },
  { name: 'Ocean King Jackpot', providerCodes: ['JL'] },
  { name: 'Mega Fishing', providerCodes: ['JL'] },
  { name: 'Circus Jackpot', providerCodes: ['JL'] },
  { name: 'Gods Grant Fortune', providerCodes: ['FACHAI'] },
  { name: 'FORTUNE ZOMBIE', providerCodes: ['JL'] },
  { name: 'Bombing Fishing', providerCodes: ['JL'] },
  { name: 'Dinosaur Tycoon', providerCodes: ['JL'] },
  { name: 'Royal Fishing', providerCodes: ['JL'] },
  { name: 'Star Hunter', providerCodes: ['FACHAI'] },
  { name: 'Dinosaur Tycoon II', providerCodes: ['JL'] },
  { name: 'All-Star Fishing', providerCodes: ['JL'] },
  { name: 'Boom Legend', providerCodes: ['JL'] },
  { name: 'Dragon Fishing', providerCodes: ['JDB'] },
  { name: 'Cai Shen Fishing', providerCodes: ['JDB'] },
  { name: 'Monkey King Fishing', providerCodes: ['FACHAI'] },
  { name: 'Fa Chai Fishing', providerCodes: ['FACHAI'] },
];

// Cards/Poker — all 20 are KingMaker/King Midas instant-table titles that
// share the one KM provider code. Several of these (Sic Bo, Dice Duel,
// Color Game, Hi-Lo, Coin Toss) are the kind of thing Oracle's own raw
// category could plausibly file under Instant/Casual (Mini Games) instead
// of Table/Casino — pinned here forces them into Cards regardless, same
// reasoning as the Aviator/FlyX override on PINNED_SLOTS_ORDER above.
export const PINNED_CARDS_ORDER: {
  name: string;
  providerCodes: string[];
}[] = [
  { name: '7 Up 7 Down', providerCodes: ['KM'] },
  { name: 'Coin Toss', providerCodes: ['KM'] },
  { name: 'Sic Bo', providerCodes: ['KM'] },
  { name: 'Poker Roulette', providerCodes: ['KM'] },
  { name: 'Dice Duel', providerCodes: ['KM'] },
  { name: 'Tai Xiu', providerCodes: ['KM'] },
  { name: '7 Up 7 Down Rush', providerCodes: ['KM'] },
  { name: 'Andar Bahar', providerCodes: ['KM'] },
  { name: 'Thai Fish Prawn Crab', providerCodes: ['KM'] },
  { name: '32 Cards', providerCodes: ['KM'] },
  { name: 'Triple Chance', providerCodes: ['KM'] },
  { name: 'Speedy Andar Bahar', providerCodes: ['KM'] },
  { name: 'Thai Hi Lo 2', providerCodes: ['KM'] },
  { name: 'Fish Prawn Crab 2', providerCodes: ['KM'] },
  { name: 'Burmese 6 Animals', providerCodes: ['KM'] },
  { name: 'Color Game', providerCodes: ['KM'] },
  { name: 'Vietnam Fish Prawn Crab', providerCodes: ['KM'] },
  { name: 'Dota Hi-Lo', providerCodes: ['KM'] },
  { name: 'Jogo De Bozo', providerCodes: ['KM'] },
  { name: 'European Roulette', providerCodes: ['KM'] },
];

function buildPinnedLookup(
  entries: { name: string; providerCodes: string[] }[],
): Map<string, number> {
  const lookup = new Map<string, number>();
  entries.forEach((entry, i) => {
    for (const code of entry.providerCodes) {
      lookup.set(pinKey(entry.name, code), i);
    }
  });
  return lookup;
}

const PINNED_LIVE_CASINO_LOOKUP = buildPinnedLookup(PINNED_LIVE_CASINO_ORDER);
const PINNED_FISHING_LOOKUP = buildPinnedLookup(PINNED_FISHING_ORDER);
const PINNED_CARDS_LOOKUP = buildPinnedLookup(PINNED_CARDS_ORDER);

export function pinnedLiveCasinoIndex(
  name: string,
  providerCode: string,
): number | null {
  const idx = PINNED_LIVE_CASINO_LOOKUP.get(pinKey(name, providerCode));
  return idx === undefined ? null : idx;
}

export function pinnedCardsIndex(
  name: string,
  providerCode: string,
): number | null {
  const idx = PINNED_CARDS_LOOKUP.get(pinKey(name, providerCode));
  return idx === undefined ? null : idx;
}

export function pinnedFishingIndex(
  name: string,
  providerCode: string,
): number | null {
  const idx = PINNED_FISHING_LOOKUP.get(pinKey(name, providerCode));
  return idx === undefined ? null : idx;
}

// Explicit operator-supplied display order for the (now narrowed) Sports
// section — every game from SABA shows first, then every UG game, then BTI,
// and so on, one provider block at a time (games within a provider keep
// their existing relative order, since sort is stable). Matches the 5
// providers still routed to `sports` in SPORTS_ESPORTS_PROVIDER_OVERRIDE;
// this only controls ordering, not which category a game lands in.
export const SPORTS_PROVIDER_ORDER: string[] = [
  'SABA',
  'UG',
  'BTI',
  'SBO',
  'BETBY',
];

const SPORTS_PROVIDER_ORDER_LOOKUP = new Map(
  SPORTS_PROVIDER_ORDER.map((code, i) => [code.trim().toUpperCase(), i]),
);

export function sportsProviderOrderIndex(
  _name: string,
  providerCode: string,
): number | null {
  const idx = SPORTS_PROVIDER_ORDER_LOOKUP.get(
    providerCode.trim().toUpperCase(),
  );
  return idx === undefined ? null : idx;
}

// IA's thumbnail/original URLs are always just the provider's base path
// with no filename (confirmed 404 live), so every IA game shows a broken
// card image. Rather than hide the games, push them to the end of the
// Esports row/browse list instead of showing broken art first.
export const ESPORTS_BROKEN_THUMBNAIL_PROVIDERS = new Set(['IA']);

// Same problem as IA above, but scoped to the URL shape rather than a whole
// provider — VIVO's live-casino catalog has this for every table game
// except its "Game lobby" entry, whose thumbnail is a real file (confirmed
// live: the broken ones 403 with no filename after the provider segment,
// e.g. "https://oraclegames.net/thumbnail/VIVO/"; the lobby's own
// ".../VIVO/178312591955.webp" 200s). Checking the URL shape instead of
// hardcoding VIVO keeps the one working VIVO game in its normal position
// and self-heals if Oracle fixes more of them later.
function lacksFilename(url: string): boolean {
  const lastSegment = url.replace(/\/+$/, '').split('/').pop() ?? '';
  return !/\.[a-z0-9]+$/i.test(lastSegment);
}

export function hasBrokenThumbnail(g: {
  thumbnail: string;
  original: string;
}): boolean {
  const img = g.thumbnail || g.original;
  return !img || lacksFilename(img);
}
