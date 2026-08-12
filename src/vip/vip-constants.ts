// VIP tier generation formula — adapted from the business spec. Values are
// seeded once into vip_tiers (see VipService.onModuleInit) and can be edited
// afterward through the CRM; this file only controls what gets generated the
// very first time the table is empty.

export const VIP_MAX_LEVEL = 50;

type Group = {
  name: string;
  nameBn: string;
  minLevel: number;
  maxLevel: number;
  // Perk metadata only — surfaced to admins/players, not paid out
  // automatically (no referral-earnings or cashback engine exists yet).
  referralSignupBonus: number;
  referralBetCommissionPct: number;
  dailyCashbackPct: number;
};

export const VIP_GROUPS: Group[] = [
  { name: 'Newcomer', nameBn: 'নতুন', minLevel: 0, maxLevel: 0, referralSignupBonus: 120, referralBetCommissionPct: 0.003, dailyCashbackPct: 0.01 },
  { name: 'Bronze', nameBn: 'ব্রোঞ্জ', minLevel: 1, maxLevel: 2, referralSignupBonus: 160, referralBetCommissionPct: 0.005, dailyCashbackPct: 0.02 },
  { name: 'Silver', nameBn: 'সিলভার', minLevel: 3, maxLevel: 5, referralSignupBonus: 200, referralBetCommissionPct: 0.008, dailyCashbackPct: 0.03 },
  { name: 'Gold', nameBn: 'গোল্ড', minLevel: 6, maxLevel: 8, referralSignupBonus: 360, referralBetCommissionPct: 0.012, dailyCashbackPct: 0.04 },
  { name: 'Platinum', nameBn: 'প্লাটিনাম', minLevel: 9, maxLevel: 18, referralSignupBonus: 420, referralBetCommissionPct: 0.018, dailyCashbackPct: 0.05 },
  { name: 'Diamond', nameBn: 'ডায়মন্ড', minLevel: 19, maxLevel: 50, referralSignupBonus: 800, referralBetCommissionPct: 0.025, dailyCashbackPct: 0.07 },
];

export function getGroupForLevel(level: number): Group {
  return (
    VIP_GROUPS.find((g) => level >= g.minLevel && level <= g.maxLevel) ??
    VIP_GROUPS[VIP_GROUPS.length - 1]
  );
}

// Level-up bonus brackets — flat amounts for small brackets, linear
// interpolation across "progressive" ranges (min at the bracket's first
// level, max at its last).
type BonusBracket = { minLevel: number; maxLevel: number; from: number; to: number };
const BONUS_BRACKETS: BonusBracket[] = [
  { minLevel: 0, maxLevel: 0, from: 0, to: 0 },
  { minLevel: 1, maxLevel: 2, from: 100, to: 100 },
  { minLevel: 3, maxLevel: 5, from: 300, to: 300 },
  { minLevel: 6, maxLevel: 8, from: 1_000, to: 1_000 },
  { minLevel: 9, maxLevel: 11, from: 2_000, to: 2_000 },
  { minLevel: 12, maxLevel: 14, from: 2_500, to: 2_500 },
  { minLevel: 15, maxLevel: 18, from: 4_000, to: 6_000 },
  { minLevel: 19, maxLevel: 25, from: 8_000, to: 15_000 },
  { minLevel: 26, maxLevel: 40, from: 20_000, to: 50_000 },
  { minLevel: 41, maxLevel: 49, from: 60_000, to: 200_000 },
  { minLevel: 50, maxLevel: 50, from: 500_000, to: 500_000 },
];

export function getLevelUpBonus(level: number): number {
  const b = BONUS_BRACKETS.find((x) => level >= x.minLevel && level <= x.maxLevel);
  if (!b) return 0;
  if (b.minLevel === b.maxLevel) return b.from;
  const t = (level - b.minLevel) / (b.maxLevel - b.minLevel);
  return Math.round((b.from + (b.to - b.from) * t) / 100) * 100;
}

export function getTurnoverMultiplier(level: number): number {
  if (level <= 5) return 2;
  if (level <= 8) return 3;
  if (level <= 18) return 4;
  return 5;
}

export function getBonusValidityDays(level: number): number {
  if (level <= 5) return 15;
  if (level <= 8) return 20;
  if (level <= 18) return 30;
  return 45;
}

// Compounding deposit requirement — level 1 starts at baseDeposit, then each
// subsequent level multiplies the PREVIOUS level's (already-rounded)
// requirement by the growth rate for its own range. This is a deliberate
// reading of the spec's "base * rate^level": applying the exponent directly
// per-level would create a discontinuous jump at every range boundary
// (e.g. level 10→11 switching bases), which isn't a sane requirement curve.
// Compounding off the prior level keeps it smooth.
const BASE_DEPOSIT = 500;
function growthRateForLevel(level: number): number {
  if (level <= 10) return 1.5;
  if (level <= 25) return 1.35;
  return 1.25;
}
function roundToNearest100(n: number): number {
  return Math.round(n / 100) * 100;
}

export function generateRequiredDeposit(level: number): number {
  if (level <= 0) return 0;
  let amount = BASE_DEPOSIT;
  for (let l = 2; l <= level; l++) {
    amount = roundToNearest100(amount * growthRateForLevel(l));
  }
  return level === 1 ? amount : amount;
}

export function generateRequiredBet(level: number): number {
  return generateRequiredDeposit(level) * 4;
}

export type GeneratedTier = {
  level: number;
  groupName: string;
  nameBn: string;
  nameEn: string;
  requiredDeposit: number;
  requiredBet: number;
  bonusAmount: number;
  turnoverMultiplier: number;
  bonusValidityDays: number;
  referralSignupBonus: number;
  referralBetCommissionPct: number;
  dailyCashbackPct: number;
};

// Roman-numeral-ish label for a level's position within its group, matching
// the "সিলভার II" style naming from the spec — group name alone for the
// single-level Newcomer tier.
function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let result = '';
  let remaining = n;
  for (const [value, symbol] of numerals) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}

export function generateTier(level: number): GeneratedTier {
  const group = getGroupForLevel(level);
  const positionInGroup = level - group.minLevel + 1;
  const suffix = group.minLevel === group.maxLevel ? '' : ` ${toRoman(positionInGroup)}`;

  return {
    level,
    groupName: group.name,
    nameBn: `${group.nameBn}${suffix}`,
    nameEn: `${group.name}${suffix}`,
    requiredDeposit: generateRequiredDeposit(level),
    requiredBet: generateRequiredBet(level),
    bonusAmount: getLevelUpBonus(level),
    turnoverMultiplier: getTurnoverMultiplier(level),
    bonusValidityDays: getBonusValidityDays(level),
    referralSignupBonus: group.referralSignupBonus,
    referralBetCommissionPct: group.referralBetCommissionPct,
    dailyCashbackPct: group.dailyCashbackPct,
  };
}
