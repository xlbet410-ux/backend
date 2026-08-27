// Read-only diagnostic for agent zxc's (referral code AGYHQXNX) commission
// wallet — prints the exact state getWalletSummary computes, every
// AgentCommission ledger row, and every AgentSettlement request, so an
// "Internal Server Error" or "you can request at most ৳0" report can be
// diagnosed from real data instead of guessing. Makes no changes.
//
// Run from the backend app's root directory:
//   node scripts/diagnose-zxc-wallet.js
const path = require("path");

const { PrismaService } = require(path.join(__dirname, "..", "dist/src/prisma/prisma.service"));
const { AgentsService } = require(path.join(__dirname, "..", "dist/src/agents/agents.service"));

const AGENT_REFERRAL_CODE = "AGYHQXNX";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const agent = await prisma.agent.findFirst({ where: { referralCode: AGENT_REFERRAL_CODE } });
  if (!agent) {
    console.error(`No agent found with referral code ${AGENT_REFERRAL_CODE}.`);
    process.exit(1);
  }
  console.log(`Agent: id=${agent.id} name=${agent.fullName} type=${agent.type} isActive=${agent.isActive} commission=${agent.commission}%\n`);

  const commissionRows = await prisma.agentCommission.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "asc" },
  });
  console.log(`AgentCommission ledger rows (${commissionRows.length}):`);
  for (const r of commissionRows) {
    console.log(
      `  id=${r.id} playerId=${r.playerId} sourceGameTransactionId=${r.sourceGameTransactionId} lossAmount=${r.lossAmount} rate=${r.commissionRate}% commissionAmount=${r.commissionAmount} createdAt=${r.createdAt.toISOString()}`
    );
  }

  const settlementRows = await prisma.agentSettlement.findMany({
    where: { agentId: agent.id },
    orderBy: { requestedAt: "asc" },
  });
  console.log(`\nAgentSettlement rows (${settlementRows.length}):`);
  for (const s of settlementRows) {
    console.log(
      `  id=${s.id} status=${s.status} amount=${s.amount} note=${s.note ?? "—"} requestedAt=${s.requestedAt.toISOString()} confirmedBy=${s.confirmedBy ?? "—"} confirmedAt=${s.confirmedAt ? s.confirmedAt.toISOString() : "—"}`
    );
  }

  console.log("\ngetWalletSummary() result:");
  try {
    const offers = new AgentsService(prisma, {}, {});
    const summary = await offers.getWalletSummary(agent.id.toString());
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.log("THREW AN ERROR (this would be the Internal Server Error you're seeing):");
    console.error(err);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
