// One-time: backfills the commission agent "zxc" (referral code AGYHQXNX)
// would have earned from referred player "don 2" (member ID 2XL-452876)'s
// ৳6,020 loss, had zxc been Commission-type at the time — it wasn't (it was
// Personal-type, which never writes to the AgentCommission ledger), so
// this loss was never recorded even after switching zxc to Commission-type
// afterward (that switch only affects bets placed from then on).
//
// Uses the exact same deposit-capped formula as the real
// recordLossCommission path: commissionAmount = min(cumulativeLoss,
// cumulativeDeposit) * rate / 100, minus whatever's already recorded (0
// here, since nothing was ever written for this pair). Attached to don 2's
// most recent real bet as the required sourceGameTransactionId anchor —
// lossAmount/commissionAmount on the row reflect the full cumulative
// backfill, not just that one bet, matching how a topped-up incremental
// entry already looks elsewhere in the ledger.
//
// Run from the backend app's root directory:
//   node scripts/backfill-zxc-commission.js
//
// Safe to run more than once — if a commission row already exists for the
// anchor transaction (i.e. this already ran), it skips instead of
// double-crediting.
const path = require("path");

const { PrismaService } = require(path.join(__dirname, "..", "dist/src/prisma/prisma.service"));
const { Prisma } = require(path.join(__dirname, "..", "dist/generated/prisma/client"));

const AGENT_REFERRAL_CODE = "AGYHQXNX";
const PLAYER_MEMBER_ID = "2XL-452876";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const agent = await prisma.agent.findFirst({ where: { referralCode: AGENT_REFERRAL_CODE } });
  if (!agent) {
    console.error(`No agent found with referral code ${AGENT_REFERRAL_CODE}.`);
    process.exit(1);
  }
  if (agent.type !== "commission") {
    console.error(`Agent ${agent.id} is type "${agent.type}", not "commission" — refusing to backfill. Switch the agent's type first.`);
    process.exit(1);
  }
  if (agent.commission.lessThanOrEqualTo(0)) {
    console.error(`Agent ${agent.id} has a 0% commission rate — nothing to backfill.`);
    process.exit(1);
  }

  const player = await prisma.user.findFirst({ where: { memberId: PLAYER_MEMBER_ID } });
  if (!player) {
    console.error(`No player found with member ID ${PLAYER_MEMBER_ID}.`);
    process.exit(1);
  }

  const [depositAgg, betsAgg, alreadyRecordedAgg, lastBet] = await Promise.all([
    prisma.cashTransaction.aggregate({
      where: { userId: player.id, type: "cash_in", status: "completed" },
      _sum: { amount: true },
    }),
    prisma.gameTransaction.aggregate({
      where: { userId: player.id },
      _sum: { betAmount: true, winAmount: true },
    }),
    prisma.agentCommission.aggregate({
      where: { agentId: agent.id, playerId: player.id },
      _sum: { commissionAmount: true },
    }),
    prisma.gameTransaction.findFirst({
      where: { userId: player.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!lastBet) {
    console.error(`Player ${player.id} has no game transactions to anchor a backfill entry to.`);
    process.exit(1);
  }

  const alreadyAnchored = await prisma.agentCommission.findUnique({
    where: { sourceGameTransactionId: lastBet.id },
  });
  if (alreadyAnchored) {
    console.log("Backfill already applied (anchor transaction already has a commission entry) — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const cumulativeDeposit = depositAgg._sum.amount ?? new Prisma.Decimal(0);
  const cumulativeWagered = betsAgg._sum.betAmount ?? new Prisma.Decimal(0);
  const cumulativeWon = betsAgg._sum.winAmount ?? new Prisma.Decimal(0);
  const cumulativeLoss = Prisma.Decimal.max(0, cumulativeWagered.sub(cumulativeWon));
  const cappedBasis = Prisma.Decimal.min(cumulativeLoss, cumulativeDeposit);
  const totalOwed = cappedBasis.mul(agent.commission).div(100);
  const alreadyRecorded = alreadyRecordedAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
  const commissionAmount = Prisma.Decimal.max(0, totalOwed.sub(alreadyRecorded));

  console.log(`Agent: ${agent.id} (${agent.fullName}), rate ${agent.commission}%`);
  console.log(`Player: ${player.id} (${player.fullName})`);
  console.log(`Cumulative deposit: ${cumulativeDeposit}, cumulative loss: ${cumulativeLoss}`);
  console.log(`Capped basis: ${cappedBasis}, total owed: ${totalOwed}, already recorded: ${alreadyRecorded}`);
  console.log(`Backfilling commission: ${commissionAmount}`);

  if (commissionAmount.lessThanOrEqualTo(0)) {
    console.log("Computed backfill is 0 — nothing to write.");
    await prisma.$disconnect();
    return;
  }

  await prisma.agentCommission.create({
    data: {
      agentId: agent.id,
      playerId: player.id,
      sourceGameTransactionId: lastBet.id,
      lossAmount: cumulativeLoss,
      commissionRate: agent.commission,
      commissionAmount,
    },
  });

  console.log("\nDone — wallet should now show this as real, settleable commission.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
