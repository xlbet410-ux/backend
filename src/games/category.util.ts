import { GameCategory } from "./catalog.types";

// Oracle tags every individual game with its own category (e.g. "Slot",
// "Fish", "Crash", "Table"). Verified against live API responses by
// spot-checking real game names per bucket — e.g. JILI's "Casino" category
// is Poker King/Dragon & Tiger/Baccarat (table games), and V8's
// "Hundred-player" is Baccarat/SicBo/Tai Xiu variants (also table games).
const RAW_CATEGORY_MAP: Record<string, GameCategory> = {
  Slot: "slots",
  Fish: "fish-catch",
  Sports: "sports",
  Esports: "esports",

  Crash: "mini-game",
  Mini: "mini-game",
  Instant: "mini-game",
  Plinko: "mini-game",
  Mines: "mini-game",
  Dice: "mini-game",
  "HI-LO": "mini-game",
  Keno: "mini-game",
  Scratch: "mini-game",
  "Scratch cards": "mini-game",
  Tower: "mini-game",
  "Wheel of Fortune": "mini-game",
  Lottery: "mini-game",
  Marbles: "mini-game",

  Table: "table-games",
  Card: "table-games",
  Poker: "table-games",
  Roulette: "table-games",
  BlackJack: "table-games",
  Baccarat: "table-games",
  Casino: "table-games",
  "Hundred-player": "table-games",

  Arcade: "arcade",
  Multiplayer: "arcade",
  Casual: "arcade",

  "Casino Live": "live-games",
  "Game Shows": "live-games",

  Cockfighting: "other",
  Animal: "other",
  Other: "other",
};

// Fallback only for games with a missing/unrecognized category — e.g.
// 18Peaches has null-category games that are actually slots. Keyed by
// provider code (stable) rather than name (varies in casing/spelling).
const CODE_CATEGORY_FALLBACK: Record<string, GameCategory> = {
  // ---------- LIVE GAMES (live dealer) ----------
  YEEBET: "live-games",
  WM: "live-games",
  AG: "live-games",
  ON: "live-games",
  SA: "live-games",
  SEXY: "live-games",
  PPLIVE: "live-games",
  DREAM: "live-games",
  EVOASIA: "live-games",
  EVOLIVEROW: "live-games",
  EVOBTGROW: "live-games",
  EVOBNLCROW: "live-games",
  EVOREDTIGERROW: "live-games",
  EZUGI: "live-games",
  BG: "live-games",
  BIGGAMING: "live-games",
  VIVO: "live-games",
  CREEDROOMZ: "live-games",
  WINTOLIVE: "live-games",
  ATG: "live-games",
  PTASIA: "live-games", // Playtech Asia — has live tables
  PLAYTECHEU: "live-games",
  GAMINGSOFTAILIVECASINO: "live-games",
  ONE: "live-games",
  MT: "live-games",
  IA: "live-games",
  WS168: "live-games",
  AURAGAMING: "live-games",
  TITIGAMING: "live-games",
  BARBARABANG: "live-games",
  VELIPLAY: "live-games",
  EVO888H5: "live-games",

  // ---------- SPORTS ----------
  SABA: "sports",
  UG: "sports",
  BTI: "sports",
  SBO: "sports",
  CMD: "sports",
  DP: "sports",
  LUCKSPORT: "sports",
  WYNSOSPORTS: "sports",
  "9W": "sports", // 9 wicket — cricket/sports
  KOOLBET: "sports",
  BETBY: "sports",

  // ---------- ESPORTS ----------
  ASTAR: "esports",
  TF: "esports",
  DPES: "esports",

  // ---------- SLOTS (default for game studios) ----------
  PG: "slots",
  JL: "slots",
  JDB: "slots",
  TADA: "slots",
  CQ9: "slots",
  KM: "slots",
  V8: "slots",
  FACHAI: "slots",
  EAZY: "slots",
  GAMEART: "slots",
  RELAX: "slots",
  SKYWIND: "slots",
  PLAYNGO: "slots",
  PLAYSON: "slots",
  T1: "slots",
  IDEAL: "slots",
  PGS: "slots",
  RICH88: "slots",
  PIX: "slots",
  NS: "slots",
  PP: "slots",
  SPRIBE: "slots", // crash/arcade — grouped under slots
  HABANERO: "slots",
  MG: "slots",
  YGR: "slots",
  HACKSAWASIA: "slots",
  HACKSAWLATAM: "slots",
  HACKSAWWORLD: "slots",
  BNG: "slots",
  EVOPLAYASIA: "slots",
  EVOPLAYEU: "slots",
  "5G": "slots",
  MINI: "slots",
  "2J": "slots",
  EPICWIN: "slots",
  SMARTSOFT: "slots",
  WONWON: "slots",
  BT: "slots",
  GALAXSYS: "slots",
  EXPANSE: "slots",
  INOUT: "slots",
  BNG3OKS: "slots",
  KY: "slots",
  RG: "slots",
  FASTSPIN: "slots",
  TURBOASIA: "slots",
  TURBOEU: "slots",
  "100HP": "slots",
  ASKMESLOT: "slots",
  VPLUS: "slots",
  CASINI: "slots",
  WINTOSLOT: "slots",
  TOPBET: "slots",
  KA: "slots",
  CROWDPLAY: "slots",
  ENDORPHINA: "slots",
  CASINO: "slots",
  ATM: "slots",
  AMIGO: "slots",
  RUBYPLAY: "slots",
  AVIATRIX: "slots",
  CP: "slots",
  GAMINGSOFTWOW: "slots",
  LIVE22: "slots",
  PENGUINKING: "slots",
  "18PEACHES": "slots",
  "9GAME": "slots",
  FUNKYGAMES: "slots",
  VA: "slots",
  SG: "slots",
  JLSWEEP: "slots",
  YELLOWBAT: "slots",
  RECTANGLE: "slots",
  MAC88: "slots",
  ONLYPLAY: "slots",
  CYBERBETX: "slots",
  PSG: "slots",
  EEAI: "slots",
  RICHPARADISE: "slots",
  ODIN: "slots",
  "759GAMING": "slots",
  BETSOFT: "slots",
  PGSOFT: "slots",
  NETENTASIA: "slots",
  NLCASIA: "slots",
  RTASIA: "slots",
  BTGASIA: "slots",
  RICH88_ALT: "slots",

  // ---------- OTHER (doesn't fit the categories above) ----------
  AOG: "other", // cockfighting
};

function categorizeProviderFallback(code: string, name: string): GameCategory {
  const byCode = CODE_CATEGORY_FALLBACK[code.trim().toUpperCase()];
  if (byCode) return byCode;

  const key = name.trim().toLowerCase();
  if (/e-?sport/.test(key)) return "esports";
  if (/sport/.test(key)) return "sports";
  if (/(live|casino|dealer|baccarat|roulette|blackjack)/.test(key)) return "live-games";
  if (/slot|spin|gaming|play|soft/.test(key)) return "slots";
  return "other";
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
