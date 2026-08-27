// One-time: adds English content (titleEn/descriptionEn/stepsToClaimEn/
// bonusInfoEn/termsEn) to the 9 live 2XLbet offers, which were only ever
// authored in Bangla and were silently falling back to Bangla labels
// whenever a player viewed the site in English. Sourced directly from the
// original English BdVegas catalog text, rebranded to 2XLbet (same rule
// already applied to the Bangla content: "BdVegas" -> "2XLbet", "HEYVIP"
// dropped).
//
// Run from the backend app's root directory (wherever `dist/` lives):
//   node scripts/add-english-offer-content.js
//
// Safe to run more than once — each field is just overwritten with the
// same value.
const path = require("path");

const { PrismaService } = require(path.join(__dirname, "..", "dist/src/prisma/prisma.service"));
const { OffersService } = require(path.join(__dirname, "..", "dist/src/offers/offers.service"));

const UPDATES = [
  {
    slug: "unlimited-1pct-deposit-bonus",
    titleEn: "1% Unlimited Deposit Bonus",
    descriptionEn: "Enjoy an unlimited daily bonus on 2XLbet across all games.",
    stepsToClaimEn: [
      "Sign up for an account on 2XLbet.",
      "Make a successful deposit and select this bonus offer.",
      "Deposit a minimum of ৳200.",
      "Get a 1% extra bonus on every successful deposit.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus% | 1%",
      "Wager | 1x",
      "Repetition | Unlimited",
      "Game Type | All Games",
      "Max Bonus | ৳500",
    ].join("\n"),
    termsEn:
      "Valid for all players; claimable unlimited times per deposit; unlimited max withdrawal; only bets with odds above 1.30 count; general terms apply.",
  },
  {
    slug: "cpl-welcome-bonus-150",
    titleEn: "150% CPL Welcome Bonus",
    descriptionEn: "Join 2XLbet during CPL 2026 and claim a Welcome Bonus up to ৳1,500 on your first deposit.",
    stepsToClaimEn: [
      "Sign up for an account on 2XLbet.",
      'Go to the Deposit page and select "150% CPL Welcome Bonus".',
      "Deposit a minimum of ৳500.",
      "Go to My Account > My Promotion and click Claim Now.",
      "Receive a 150% Welcome Bonus up to ৳1,500.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Welcome",
      "Game Type | All Sports",
      "Min Deposit | ৳500",
      "Bonus % | 150%",
      "Max Bonus | ৳1,500",
      "Max Withdrawal | ৳30,000",
      "Wager | 18x",
      "Repetition | Once",
    ].join("\n"),
    termsEn: "Sports only. 18x wager required for withdrawal; bonus expires in 3 days if unwagered. Must click Receive after wagering; general terms apply.",
  },
  {
    slug: "crash-welcome-bonus-50",
    titleEn: "50% Welcome Bonus on Crash Games",
    descriptionEn: "Play Crash with extra balance, claim a 50% Welcome Bonus up to ৳3,000.",
    stepsToClaimEn: [
      "Sign up.",
      'Go to the Deposit page and select "50% Welcome Bonus on Crash Games".',
      "Deposit a minimum of ৳200.",
      "Go to My Account > My Promotion > Claim Now — receive a 50% bonus up to ৳3,000.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Welcome",
      "Game Type | Crash",
      "Min Deposit | ৳200",
      "Bonus % | 50%",
      "Max Bonus | ৳3,000",
      "Max Withdrawal | ৳50,000",
      "Wager | 20x",
      "Repetition | Once",
    ].join("\n"),
    termsEn: "New players only; Crash games only. Bonus expires in 3 days if unwagered. Must click Receive after wagering; general terms apply.",
  },
  {
    slug: "casino-reload-bonus-25",
    titleEn: "25% Casino Reload Bonus",
    descriptionEn: "Reload daily and get a 25% bonus to enjoy more casino action every day.",
    stepsToClaimEn: [
      "Sign up.",
      'Go to the Deposit page and select "25% Reload Bonus on Casino Games".',
      "Make the minimum deposit.",
      "Go to My Account > My Promotion > Claim Now.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Reload",
      "Game Type | Live Casino",
      "Deposit Range | ৳200–৳25,000",
      "Bonus % | 25%",
      "Max Bonus | ৳2,000",
      "Max Withdrawal | ৳30,000",
      "Wager | 10x",
      "Repetition | Daily",
    ].join("\n"),
    termsEn: "10x wager required before withdrawal. Bonus expires in 3 days if unwagered. Max withdrawal ৳30,000; general terms apply.",
  },
  {
    slug: "casino-welcome-bonus-66",
    titleEn: "66% Welcome Bonus On Casino",
    descriptionEn: "Play Live Casino with extra balance, claim a 66% Welcome Bonus up to ৳1,500.",
    stepsToClaimEn: [
      "Sign up.",
      'Go to the Deposit page and select "66% Welcome Bonus On Casino".',
      "Deposit a minimum of ৳200.",
      "Go to My Account > My Promotion > Claim Now.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Welcome",
      "Game Type | Live Casino",
      "Min Deposit | ৳200",
      "Bonus % | 66%",
      "Max Bonus | ৳1,500",
      "Max Withdrawal | ৳50,000",
      "Wager | 12x",
      "Repetition | Once",
    ].join("\n"),
    termsEn: "New players only; Live Casino only. Bonus expires in 3 days if unwagered. Must click Receive after wagering; general terms apply.",
  },
  {
    slug: "all-games-welcome-bonus-100",
    titleEn: "100% Welcome Bonus On All Games",
    descriptionEn: "Start strong with a 100% Welcome Bonus up to ৳1,000 on all games.",
    stepsToClaimEn: [
      "Sign up.",
      'Go to the Deposit page and select "100% Welcome Bonus On All Games".',
      "Deposit a minimum of ৳1,000.",
      "Go to My Account > My Promotion > Claim Now.",
    ].join("\n"),
    bonusInfoEn: [
      "Game Type | All Games",
      "Bonus % | 100%",
      "Max Bonus | ৳1,000",
      "Min Deposit | ৳1,000",
      "Max Withdrawal | ৳30,000",
      "Wager | 12x",
      "Repetition | Once",
    ].join("\n"),
    termsEn: "New players only. Bonus expires in 2 days if unwagered. Must click Receive after wagering; general terms apply.",
  },
  {
    slug: "jili-welcome-bonus-200",
    titleEn: "200% JILI Slots Welcome Bonus",
    descriptionEn: "Spin more and win bigger with a 200% Welcome Bonus up to ৳2,000 on JILI Slots.",
    stepsToClaimEn: [
      "Sign up.",
      'Go to the Deposit page and select "200% JILI Slots Welcome Bonus".',
      "Deposit a minimum of ৳500.",
      "Go to My Account > My Promotion > Claim Now.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Welcome",
      "Game Type | JILI Slots",
      "Min Deposit | ৳500",
      "Bonus % | 200%",
      "Max Bonus | ৳2,000",
      "Max Withdrawal | ৳30,000",
      "Wager | 18x",
      "Repetition | Once",
    ].join("\n"),
    termsEn: "New players only; JILI Slots only. Bonus expires in 3 days if unwagered. Must click Receive after wagering; general terms apply.",
  },
  {
    slug: "jili-daily-reload-65",
    titleEn: "65% Daily JILI Slots Reload Bonus",
    descriptionEn: "Reload daily and claim a 65% JILI Slots Reload Bonus up to ৳5,000.",
    stepsToClaimEn: [
      "Sign up.",
      'Go to the Deposit page and select "65% Daily JILI Slots Reload Bonus".',
      "Deposit a minimum of ৳200.",
      "Go to My Account > My Promotion > Claim Now.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Reload",
      "Game Type | JILI Slots",
      "Min Deposit | ৳200",
      "Bonus % | 65%",
      "Max Bonus | ৳5,000",
      "Max Withdrawal | ৳30,000",
      "Wager | 12x",
      "Repetition | Daily",
    ].join("\n"),
    termsEn: "Resets daily at 10:30 PM BST; JILI Slots only. Bonus expires in 3 days if unwagered; general terms apply.",
  },
  {
    slug: "refer-earn-1000",
    titleEn: "Refer & Earn ৳1,000 Bonus",
    descriptionEn: "Invite friends and share a ৳1,000 referral reward together (৳500 each).",
    stepsToClaimEn: [
      "Sign up and verify your phone/email.",
      "Share your referral link or code.",
      "Your friend registers using that code.",
      "You both receive ৳500 once your friend completes deposit + turnover within 7 days.",
    ].join("\n"),
    bonusInfoEn: [
      "Bonus Type | Referral",
      "Game Type | Slots & Casino",
      "Friend's Min Deposit | ৳1,000",
      "Friend's Turnover | ৳8,000",
      "Your Bonus | ৳500",
      "Wager | 16x",
      "Referral Limit | Unlimited",
      "Repetition | Unlimited",
    ].join("\n"),
    termsEn:
      "Your friend must complete deposit + turnover within 7 days of registration. The reward credits once conditions are met; general terms apply.",
  },
];

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const offers = new OffersService(prisma, {}, {}, {});

  for (const u of UPDATES) {
    const existing = await prisma.offer.findUnique({ where: { slug: u.slug }, select: { id: true } });
    if (!existing) {
      console.log(`  - ${u.slug} NOT FOUND, skipping`);
      continue;
    }
    const { slug, ...data } = u;
    await offers.updateOffer(existing.id.toString(), data);
    console.log(`  - ${slug} updated with English content`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
