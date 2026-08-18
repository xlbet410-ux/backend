// One-time data migration: deactivates every offer left over from the old
// BdVegas-style catalog and creates the 9 replacement 2XLbet offers whose
// full mechanic the Offer engine can actually pay out for real (see the
// approved plan for which 24 of the original 33 were intentionally left
// out, and why).
//
// Run from the backend app's root directory (wherever `dist/` lives),
// after a deploy that includes this repo's latest commit:
//
//   node scripts/seed-2xlbet-offers.js
//
// Safe to run more than once — deactivation skips the 9 new slugs, and
// offer creation skips (not fails) any slug that already exists.
const path = require("path");

const { PrismaService } = require(path.join(__dirname, "..", "dist/src/prisma/prisma.service"));
const { OffersService } = require(path.join(__dirname, "..", "dist/src/offers/offers.service"));

const newOffers = [
  {
    slug: "unlimited-1pct-deposit-bonus",
    titleBn: "১% আনলিমিটেড ডিপোজিট বোনাস",
    descriptionBn: "2XLbet-এ সব গেমে প্রতিদিন আনলিমিটেড বোনাস উপভোগ করুন।",
    category: "deposit",
    triggerType: "every_deposit",
    minDeposit: 200,
    maxClaimsPerUser: 100000,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 1,
    rewardCap: 500,
    turnoverMultiplier: 1,
    turnoverBase: "bonus",
    bonusValidityDays: 30,
    priority: 90,
    stepsToClaimBn: [
      "2XLbet-এ অ্যাকাউন্ট খুলুন।",
      "সফলভাবে ডিপোজিট করুন এবং এই বোনাস অফারটি সিলেক্ট করুন।",
      "সর্বনিম্ন ৳200 ডিপোজিট করুন।",
      "প্রতিটি সফল ডিপোজিটে ১% অতিরিক্ত বোনাস পান।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস% | ১%",
      "ওয়েজার | ১x",
      "পুনরাবৃত্তি | আনলিমিটেড",
      "গেম টাইপ | সব গেম",
      "সর্বোচ্চ বোনাস | ৳500",
    ].join("\n"),
    termsBn: "সব খেলোয়াড়ের জন্য প্রযোজ্য; প্রতি ডিপোজিটে আনলিমিটেড বার দাবি করা যাবে। সর্বোচ্চ উত্তোলন আনলিমিটেড। শুধুমাত্র ১.৩০-এর বেশি অডসের বেট গণনা হবে। সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "cpl-welcome-bonus-150",
    titleBn: "১৫০% CPL ওয়েলকাম বোনাস",
    descriptionBn: "CPL ২০২৬ চলাকালীন 2XLbet-এ যোগ দিন এবং আপনার প্রথম ডিপোজিটে ৳1,500 পর্যন্ত ওয়েলকাম বোনাস দাবি করুন।",
    category: "deposit",
    triggerType: "first_deposit",
    minDeposit: 500,
    maxClaimsPerUser: 1,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 150,
    rewardCap: 1500,
    turnoverMultiplier: 18,
    turnoverBase: "bonus",
    bonusValidityDays: 3,
    priority: 100,
    stepsToClaimBn: [
      "2XLbet-এ অ্যাকাউন্ট খুলুন।",
      "ডিপোজিট পেজে গিয়ে \"১৫০% CPL ওয়েলকাম বোনাস\" সিলেক্ট করুন।",
      "সর্বনিম্ন ৳500 ডিপোজিট করুন।",
      "My Account > My Promotion-এ গিয়ে Claim Now-এ ক্লিক করুন।",
      "৳1,500 পর্যন্ত ১৫০% ওয়েলকাম বোনাস পান।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | ওয়েলকাম",
      "গেম টাইপ | সব স্পোর্টস",
      "সর্বনিম্ন ডিপোজিট | ৳500",
      "বোনাস% | ১৫০%",
      "সর্বোচ্চ বোনাস | ৳1,500",
      "সর্বোচ্চ উত্তোলন | ৳30,000",
      "ওয়েজার | ১৮x",
      "পুনরাবৃত্তি | একবার",
    ].join("\n"),
    termsBn: "শুধু স্পোর্টসের জন্য প্রযোজ্য। উত্তোলনের জন্য ১৮x ওয়েজার আবশ্যক; ওয়েজার না হলে ৩ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়। ওয়েজার শেষে Receive-এ ক্লিক করতে হবে; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "crash-welcome-bonus-50",
    titleBn: "ক্র্যাশ গেমসে ৫০% ওয়েলকাম বোনাস",
    descriptionBn: "অতিরিক্ত ব্যালেন্স নিয়ে ক্র্যাশ খেলুন, ৳3,000 পর্যন্ত ৫০% ওয়েলকাম বোনাস দাবি করুন।",
    category: "deposit",
    triggerType: "first_deposit",
    minDeposit: 200,
    maxClaimsPerUser: 1,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 50,
    rewardCap: 3000,
    turnoverMultiplier: 20,
    turnoverBase: "bonus",
    bonusValidityDays: 3,
    priority: 80,
    stepsToClaimBn: [
      "সাইন আপ করুন।",
      "ডিপোজিট পেজে \"ক্র্যাশ গেমসে ৫০% স্বাগতম বোনাস!\" সিলেক্ট করুন।",
      "সর্বনিম্ন ৳200 ডিপোজিট করুন।",
      "My Account > My Promotion > Claim Now — ৳3,000 পর্যন্ত ৫০% বোনাস পান।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | ওয়েলকাম",
      "গেম টাইপ | ক্র্যাশ",
      "সর্বনিম্ন ডিপোজিট | ৳200",
      "বোনাস% | ৫০%",
      "সর্বোচ্চ বোনাস | ৳3,000",
      "সর্বোচ্চ উত্তোলন | ৳50,000",
      "ওয়েজার | ২০x",
      "পুনরাবৃত্তি | একবার",
    ].join("\n"),
    termsBn: "শুধুমাত্র নতুন খেলোয়াড়দের জন্য; শুধু ক্র্যাশ গেমে প্রযোজ্য। ওয়েজার না হলে ৩ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়। ওয়েজার শেষে Receive-এ ক্লিক করতে হবে; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "casino-reload-bonus-25",
    titleBn: "২৫% ক্যাসিনো রিলোড বোনাস",
    descriptionBn: "প্রতিদিন রিলোড করুন এবং প্রতিদিন আরও ক্যাসিনো অ্যাকশন উপভোগ করতে ২৫% বোনাস পান।",
    category: "deposit",
    triggerType: "every_deposit",
    minDeposit: 200,
    maxDeposit: 25000,
    maxClaimsPerUser: 100000,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 25,
    rewardCap: 2000,
    turnoverMultiplier: 10,
    turnoverBase: "bonus",
    bonusValidityDays: 3,
    priority: 70,
    stepsToClaimBn: [
      "সাইন আপ করুন।",
      "ডিপোজিট পেজে \"25% Reload Bonus on Casino Games\" সিলেক্ট করুন।",
      "সর্বনিম্ন ডিপোজিট করুন।",
      "My Account > My Promotion > Claim Now।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | রিলোড",
      "গেম টাইপ | লাইভ ক্যাসিনো",
      "ডিপোজিট রেঞ্জ | ৳200–৳25,000",
      "বোনাস% | ২৫%",
      "সর্বোচ্চ বোনাস | ৳2,000",
      "সর্বোচ্চ উত্তোলন | ৳30,000",
      "ওয়েজার | ১০x",
      "পুনরাবৃত্তি | প্রতিদিন",
    ].join("\n"),
    termsBn: "উত্তোলনের আগে ১০x ওয়েজার আবশ্যক। ওয়েজার না হলে ৩ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়। সর্বোচ্চ উত্তোলন ৳30,000; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "casino-welcome-bonus-66",
    titleBn: "ক্যাসিনোতে ৬৬% ওয়েলকাম বোনাস",
    descriptionBn: "অতিরিক্ত ব্যালেন্স নিয়ে লাইভ ক্যাসিনো খেলুন, ৳1,500 পর্যন্ত ৬৬% ওয়েলকাম বোনাস দাবি করুন।",
    category: "deposit",
    triggerType: "first_deposit",
    minDeposit: 200,
    maxClaimsPerUser: 1,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 66,
    rewardCap: 1500,
    turnoverMultiplier: 12,
    turnoverBase: "bonus",
    bonusValidityDays: 3,
    priority: 60,
    stepsToClaimBn: [
      "সাইন আপ করুন।",
      "ডিপোজিট পেজে \"ক্যাসিনোতে ৬৬% স্বাগতম বোনাস\" সিলেক্ট করুন।",
      "সর্বনিম্ন ৳200 ডিপোজিট করুন।",
      "My Account > My Promotion > Claim Now।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | ওয়েলকাম",
      "গেম টাইপ | লাইভ ক্যাসিনো",
      "সর্বনিম্ন ডিপোজিট | ৳200",
      "বোনাস% | ৬৬%",
      "সর্বোচ্চ বোনাস | ৳1,500",
      "সর্বোচ্চ উত্তোলন | ৳50,000",
      "ওয়েজার | ১২x",
      "পুনরাবৃত্তি | একবার",
    ].join("\n"),
    termsBn: "শুধু নতুন খেলোয়াড়দের জন্য; শুধু লাইভ ক্যাসিনোতে প্রযোজ্য। ওয়েজার না হলে ৩ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়। ওয়েজার শেষে Receive-এ ক্লিক করতে হবে; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "all-games-welcome-bonus-100",
    titleBn: "সব গেমে ১০০% ওয়েলকাম বোনাস",
    descriptionBn: "সব গেমে ৳1,000 পর্যন্ত ১০০% ওয়েলকাম বোনাস দিয়ে শক্তিশালীভাবে শুরু করুন।",
    category: "deposit",
    triggerType: "first_deposit",
    minDeposit: 1000,
    maxClaimsPerUser: 1,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 100,
    rewardCap: 1000,
    turnoverMultiplier: 12,
    turnoverBase: "bonus",
    bonusValidityDays: 2,
    priority: 110,
    stepsToClaimBn: [
      "সাইন আপ করুন।",
      "ডিপোজিট পেজে \"সকল গেমে ১০০% স্বাগতম বোনাস\" সিলেক্ট করুন।",
      "সর্বনিম্ন ৳1,000 ডিপোজিট করুন।",
      "My Account > My Promotion > Claim Now।",
    ].join("\n"),
    bonusInfoBn: [
      "গেম টাইপ | সব গেম",
      "বোনাস% | ১০০%",
      "সর্বোচ্চ বোনাস | ৳1,000",
      "সর্বনিম্ন ডিপোজিট | ৳1,000",
      "সর্বোচ্চ উত্তোলন | ৳30,000",
      "ওয়েজার | ১২x",
      "পুনরাবৃত্তি | একবার",
    ].join("\n"),
    termsBn: "শুধু নতুন খেলোয়াড়দের জন্য। ওয়েজার না হলে ২ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়। ওয়েজার শেষে Receive-এ ক্লিক করতে হবে; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "jili-welcome-bonus-200",
    titleBn: "২০০% JILI স্লটস ওয়েলকাম বোনাস",
    descriptionBn: "JILI স্লটে ৳2,000 পর্যন্ত ২০০% ওয়েলকাম বোনাস দিয়ে বেশি স্পিন করুন এবং বড় জিতুন।",
    category: "deposit",
    triggerType: "first_deposit",
    minDeposit: 500,
    maxClaimsPerUser: 1,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 200,
    rewardCap: 2000,
    turnoverMultiplier: 18,
    turnoverBase: "bonus",
    bonusValidityDays: 3,
    priority: 50,
    stepsToClaimBn: [
      "সাইন আপ করুন।",
      "ডিপোজিট পেজে \"২০০% JILI স্লটস ওয়েলকাম বোনাস\" সিলেক্ট করুন।",
      "সর্বনিম্ন ৳500 ডিপোজিট করুন।",
      "My Account > My Promotion > Claim Now।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | ওয়েলকাম",
      "গেম টাইপ | JILI স্লটস",
      "সর্বনিম্ন ডিপোজিট | ৳500",
      "বোনাস% | ২০০%",
      "সর্বোচ্চ বোনাস | ৳2,000",
      "সর্বোচ্চ উত্তোলন | ৳30,000",
      "ওয়েজার | ১৮x",
      "পুনরাবৃত্তি | একবার",
    ].join("\n"),
    termsBn: "শুধু নতুন খেলোয়াড়দের জন্য; শুধু JILI স্লটে প্রযোজ্য। ওয়েজার না হলে ৩ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়। ওয়েজার শেষে Receive-এ ক্লিক করতে হবে; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "jili-daily-reload-65",
    titleBn: "৬৫% ডেইলি JILI স্লটস রিলোড বোনাস",
    descriptionBn: "প্রতিদিন রিলোড করুন এবং ৳5,000 পর্যন্ত ৬৫% JILI স্লটস রিলোড বোনাস দাবি করুন।",
    category: "deposit",
    triggerType: "every_deposit",
    minDeposit: 200,
    maxClaimsPerUser: 100000,
    claimWindow: "lifetime",
    rewardType: "percentage",
    rewardAmount: 65,
    rewardCap: 5000,
    turnoverMultiplier: 12,
    turnoverBase: "bonus",
    bonusValidityDays: 3,
    priority: 40,
    stepsToClaimBn: [
      "সাইন আপ করুন।",
      "ডিপোজিট পেজে \"JILI স্লট গেমে ৬৫% রিলোড বোনাস\" সিলেক্ট করুন।",
      "সর্বনিম্ন ৳200 ডিপোজিট করুন।",
      "My Account > My Promotion > Claim Now।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | রিলোড",
      "গেম টাইপ | JILI স্লটস",
      "সর্বনিম্ন ডিপোজিট | ৳200",
      "বোনাস% | ৬৫%",
      "সর্বোচ্চ বোনাস | ৳5,000",
      "সর্বোচ্চ উত্তোলন | ৳30,000",
      "ওয়েজার | ১২x",
      "পুনরাবৃত্তি | প্রতিদিন",
    ].join("\n"),
    termsBn: "প্রতিদিন রাত ১০:৩০টা BST-তে রিসেট হয়; শুধু JILI স্লটে প্রযোজ্য। ওয়েজার না হলে ৩ দিনের মধ্যে বোনাস মেয়াদোত্তীর্ণ হয়; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
  {
    slug: "refer-earn-1000",
    titleBn: "রেফার করুন এবং ৳1,000 বোনাস আয় করুন",
    descriptionBn: "বন্ধুদের আমন্ত্রণ জানান, একসাথে ৳1,000 রেফারেল পুরস্কার ভাগ করুন (প্রত্যেকে ৳500)।",
    category: "referral",
    triggerType: "referral_milestone",
    maxClaimsPerUser: 100000,
    claimWindow: "lifetime",
    rewardType: "fixed",
    rewardAmount: 500,
    turnoverMultiplier: 16,
    turnoverBase: "bonus",
    bonusValidityDays: 30,
    priority: 30,
    stepsToClaimBn: [
      "সাইন আপ করুন এবং ফোন/ইমেইল ভেরিফাই করুন।",
      "রেফারেল লিংক/কোড শেয়ার করুন।",
      "বন্ধু সেই কোড দিয়ে রেজিস্টার করে।",
      "বন্ধু ৭ দিনের মধ্যে ডিপোজিট + টার্নওভার সম্পন্ন করলে আপনি ৳500 পাবেন।",
    ].join("\n"),
    bonusInfoBn: [
      "বোনাস টাইপ | রেফারেল",
      "গেম টাইপ | স্লটস ও ক্যাসিনো",
      "বন্ধুর সর্বনিম্ন ডিপোজিট | ৳1,000",
      "বন্ধুর টার্নওভার | ৳8,000",
      "আপনার বোনাস | ৳500",
      "ওয়েজার | ১৬x",
      "রেফারেল সীমা | আনলিমিটেড",
      "পুনরাবৃত্তি | আনলিমিটেড",
    ].join("\n"),
    termsBn: "রেজিস্ট্রেশনের ৭ দিনের মধ্যে বন্ধুকে ডিপোজিট+টার্নওভার সম্পন্ন করতে হবে। শর্ত পূরণ হলে পুরস্কার ক্রেডিট হয়; সাধারণ শর্তাবলী প্রযোজ্য।",
  },
];

const newSlugs = new Set(newOffers.map((o) => o.slug));

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const offers = new OffersService(prisma, /* notification */ {}, /* balance */ {});

  // 1. Deactivate every currently-active offer that ISN'T one of the 9
  // being (re)created below — reversible soft delete, keeps OfferClaim
  // history intact. Skipping the 9 new slugs makes this safe to re-run.
  const active = await prisma.offer.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
  const toDeactivate = active.filter((o) => !newSlugs.has(o.slug));
  console.log(`Deactivating ${toDeactivate.length} old offer(s):`);
  for (const o of toDeactivate) {
    console.log(`  - ${o.slug}`);
    await offers.softDeleteOffer(o.id.toString());
  }

  // 2. Create the 9 new offers. Skips (doesn't fail) any slug that
  // already exists, so re-running this script is harmless.
  console.log(`\nCreating ${newOffers.length} new offer(s):`);
  for (const dto of newOffers) {
    const existing = await prisma.offer.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (existing) {
      console.log(`  - ${dto.slug} (already exists, skipping)`);
      continue;
    }
    console.log(`  - ${dto.slug}`);
    await offers.createOffer(dto);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
