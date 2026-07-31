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
  Esports: 'sports',
  Cockfighting: 'sports',
  Animal: 'sports',
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
  AOG: 'sports', // cockfighting — verified via real game names (e.g. "COCKFIGHT03")

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

// Explicit curation: these exact titles are shown first, in this exact
// order, in the Slots section, replicating a reference design the operator
// asked to match. Two of these (Aviator, FlyX*) are Crash-mechanic games
// that categorizeGame() would otherwise route to Mini Games — they're
// deliberately pinned into Slots here, overriding the normal per-game
// category for just these names, per that explicit request.
export const PINNED_SLOTS_ORDER: string[] = [
  'Super Ace',
  'Aviator',
  'Wild Bounty Showdown',
  'Super Elements',
  'Magic Ace WILD LOCK',
  'Fortune Gems 3',
  'Fortune Garuda 500',
  'FlyX',
  'Circus Joker 4096',
  'Boxing King',
  'Super Ace Deluxe',
  'Super Ace II',
  'Treasures of Aztec',
  'Anubis Wrath',
  'Money Coming',
  'Fortune Gems 2',
  'FlyX Cash Turbo',
  'Pinata Wins',
  'Egypt Power x1000',
  'Chinese New Year Moreways',
];

const PINNED_SLOTS_LOOKUP = new Map(
  PINNED_SLOTS_ORDER.map((name, i) => [name.trim().toLowerCase(), i]),
);

export function pinnedSlotsIndex(name: string): number | null {
  const idx = PINNED_SLOTS_LOOKUP.get(name.trim().toLowerCase());
  return idx === undefined ? null : idx;
}
