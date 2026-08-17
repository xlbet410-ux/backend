// One-off maintenance script: removes agent_commissions rows that were
// earned while a real (non-deposit_turnover) BonusWallet was active for
// that player at the time the row was created — i.e. commission that was
// wrongly earned on bonus/offer money before the principal-only fix.
//
// Safe to delete: agent_commissions is a reporting-only ledger (agents have
// no in-platform wallet — see recordLossCommission's own comment), so
// nothing needs to be clawed back from anyone's real balance.
//
// Usage:
//   node backfill-principal-commission.js            -> DRY RUN (counts/lists only, deletes nothing)
//   node backfill-principal-commission.js --confirm   -> actually deletes the identified rows
require('dotenv').config();
const { Client } = require('pg');

const CONFIRM = process.argv.includes('--confirm');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // A commission row is "wrongly earned on bonus money" if, at the row's
  // own created_at, some OTHER (non-deposit_turnover) bonus wallet for the
  // same player was active: claimed_at <= created_at, and not yet resolved
  // by created_at (completed_at doubles as the general "resolved at" stamp
  // for completed/forfeited/expired — see BonusService), and not expired by
  // created_at either.
  const findQuery = `
    SELECT ac.id, ac.agent_id, ac.player_id, ac.created_at, ac.loss_amount, ac.commission_amount
    FROM agent_commissions ac
    WHERE EXISTS (
      SELECT 1 FROM bonus_wallets bw
      WHERE bw.user_id = ac.player_id
        AND bw.type != 'deposit_turnover'
        AND bw.claimed_at <= ac.created_at
        AND (bw.completed_at IS NULL OR bw.completed_at > ac.created_at)
        AND (bw.expires_at IS NULL OR bw.expires_at > ac.created_at)
    )
    ORDER BY ac.created_at ASC
  `;

  const result = await c.query(findQuery);
  console.log(`Found ${result.rows.length} agent_commissions row(s) earned while a bonus was active:`);
  for (const row of result.rows) {
    console.log(
      `  id=${row.id} agent=${row.agent_id} player=${row.player_id} created=${row.created_at.toISOString()} loss=${row.loss_amount} commission=${row.commission_amount}`
    );
  }

  const totalCommission = result.rows.reduce((sum, r) => sum + Number(r.commission_amount), 0);
  console.log(`Total commission amount affected: ${totalCommission.toFixed(2)}`);

  if (!CONFIRM) {
    console.log('\nDRY RUN — no rows deleted. Re-run with --confirm to actually delete these rows.');
  } else if (result.rows.length > 0) {
    const ids = result.rows.map((r) => r.id);
    const del = await c.query(`DELETE FROM agent_commissions WHERE id = ANY($1::bigint[])`, [ids]);
    console.log(`Deleted ${del.rowCount} row(s).`);
  } else {
    console.log('Nothing to delete.');
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
