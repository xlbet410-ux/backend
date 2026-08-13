import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';

// Idempotent — safe to run multiple times (e.g. once per environment, or
// again after a fix). Creates the referral milestone ladder, Red Envelope
// Rain, and Members Day if missing (skip-on-conflict), then always
// re-applies their daily-pool / weighted-prize / recurring-schedule config
// so a repeat run reinforces the intended settings rather than erroring.
//
// Run once per environment via:
//   npx prisma migrate deploy
//   npx prisma generate
//   node dist/src/scripts/seed-launch-offers.js

const MILESTONE_TIERS: { tier: number; reward: number }[] = [
  { tier: 3, reward: 30 },
  { tier: 7, reward: 40 },
  { tier: 12, reward: 50 },
  { tier: 20, reward: 100 },
  { tier: 50, reward: 300 },
  { tier: 100, reward: 500 },
  { tier: 200, reward: 1000 },
  { tier: 500, reward: 3000 },
  { tier: 1000, reward: 5000 },
  { tier: 2000, reward: 10000 },
  { tier: 3000, reward: 15000 },
  { tier: 5000, reward: 30000 },
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const offersService = app.get(OffersService);

  const created: string[] = [];
  const skipped: string[] = [];

  async function createIfMissing(dto: Parameters<OffersService['createOffer']>[0]) {
    try {
      await offersService.createOffer(dto);
      created.push(dto.slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already exists')) {
        skipped.push(dto.slug);
      } else {
        throw new Error(`Failed creating ${dto.slug}: ${msg}`);
      }
    }
  }

  for (const { tier, reward } of MILESTONE_TIERS) {
    await createIfMissing({
      slug: `referral-milestone-${tier}`,
      titleBn: `রেফারেল অর্জন — ${tier} জন রেফার`,
      titleEn: `Referral Achievement — ${tier} referrals`,
      descriptionBn: `আপনার ${tier} তম সফল রেফারেলে ৳${reward} বোনাস।`,
      category: 'referral',
      triggerType: 'referral_milestone',
      triggerConfig: { tier },
      maxClaimsPerUser: 1,
      claimWindow: 'lifetime',
      rewardType: 'fixed',
      rewardAmount: reward,
      turnoverMultiplier: 0,
      turnoverBase: 'bonus',
      bonusValidityDays: 30,
      isActive: true,
      priority: tier,
      showInPromotionsPage: true,
      showInPopup: false,
    } as never);
  }

  await createIfMissing({
    slug: 'red-envelope-rain',
    titleBn: 'রেড এনভেলপ রেইন',
    titleEn: 'Red Envelope Rain',
    descriptionBn:
      'প্রতিদিন একটি লাল খাম খুলে ৳৫০ - ৳৯৯৯ পর্যন্ত র‌অ্যান্ডম বোনাস জিতুন। প্রতিদিন একবার সুযোগ পাবেন।',
    category: 'special',
    triggerType: 'manual_claim',
    maxClaimsPerUser: 1,
    claimWindow: 'daily',
    rewardType: 'random',
    rewardMin: 50,
    rewardMax: 999,
    turnoverMultiplier: 3,
    turnoverBase: 'bonus',
    bonusValidityDays: 7,
    totalBudget: 10000000,
    isActive: true,
    priority: 100,
    showInPromotionsPage: true,
    showInPopup: true,
    popupCtaTextBn: 'খাম খুলুন',
    popupCtaTextEn: 'Open Envelope',
  } as never);

  await createIfMissing({
    slug: 'members-day-deposit-bonus',
    titleBn: 'মেম্বার্স ডে — ডিপোজিট বোনাস',
    titleEn: 'Members Day — Deposit Bonus',
    descriptionBn: 'প্রতি মাসের ১, ১১ ও ২১ তারিখে যেকোনো ডিপোজিটে ৮% বোনাস (সর্বোচ্চ ৳৮৮৮)।',
    category: 'special',
    triggerType: 'every_deposit',
    minDeposit: 100,
    maxClaimsPerUser: 1,
    claimWindow: 'lifetime',
    rewardType: 'percentage',
    rewardAmount: 8,
    rewardCap: 888,
    turnoverMultiplier: 5,
    turnoverBase: 'deposit_plus_bonus',
    bonusValidityDays: 7,
    isActive: true,
    priority: 90,
    showInPromotionsPage: true,
    showInPopup: true,
    popupCtaTextBn: 'এখনই ডিপোজিট করুন',
    popupCtaTextEn: 'Deposit Now',
    popupCtaLink: '/deposit-withdraw',
  } as never);

  // Always re-applied (not just on first creation) so a repeat run fixes
  // drift instead of erroring, and so it also fixes up an offer that was
  // created by an earlier version of this script before these fields
  // existed.
  const envelope = await prisma.offer.findUnique({ where: { slug: 'red-envelope-rain' } });
  if (envelope) {
    await offersService.updateOffer(envelope.id.toString(), {
      dailyBudgetCap: 500000,
      dailyClaimCap: 1000,
      rewardDistribution: [
        { amount: 50, weight: 40 },
        { amount: 100, weight: 25 },
        { amount: 200, weight: 15 },
        { amount: 333, weight: 10 },
        { amount: 500, weight: 6 },
        { amount: 700, weight: 3 },
        { amount: 999, weight: 1 },
      ],
    } as never);
    console.log('red-envelope-rain: daily pool + weighted prizes applied.');
  }

  const membersDay = await prisma.offer.findUnique({ where: { slug: 'members-day-deposit-bonus' } });
  if (membersDay) {
    const days = [1, 11, 21];
    const now = new Date();
    const dayOf = (y: number, m: number, d: number) => ({
      start: new Date(y, m, d, 0, 0, 0, 0),
      end: new Date(y, m, d, 23, 59, 59, 999),
    });
    const today = now.getDate();
    let window: { start: Date; end: Date };
    if (days.includes(today)) {
      window = dayOf(now.getFullYear(), now.getMonth(), today);
    } else {
      const nextThisMonth = days.find((d) => d > today);
      if (nextThisMonth !== undefined) {
        window = dayOf(now.getFullYear(), now.getMonth(), nextThisMonth);
      } else {
        const nextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
        const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
        window = dayOf(year, nextMonth, days[0]);
      }
    }
    await offersService.updateOffer(membersDay.id.toString(), {
      recurringMonthDays: days,
      startsAt: window.start.toISOString(),
      endsAt: window.end.toISOString(),
    } as never);
    console.log('members-day-deposit-bonus: recurring schedule applied.');
  }

  console.log('Created:', created.length ? created.join(', ') : '(none — already existed)');
  console.log('Skipped (already existed):', skipped.length ? skipped.join(', ') : '(none)');

  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
