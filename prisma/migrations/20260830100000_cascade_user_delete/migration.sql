-- Deleting a user from the CRM's All Users page was throwing a 500: several
-- tables referencing users still had their original ON DELETE RESTRICT (the
-- Prisma default when a migration was generated with no onDelete specified),
-- so any user with a bonus wallet, offer claim, VIP upgrade, referral,
-- referral/loss commission, cashback grant, or login streak log blocked the
-- delete with a foreign key violation. UsersService.remove() has always
-- assumed everything cascades — this makes that actually true.
-- (notifications_user_id_fkey is already ON DELETE CASCADE — left alone.)

ALTER TABLE "offer_claims" DROP CONSTRAINT "offer_claims_user_id_fkey";
ALTER TABLE "offer_claims" ADD CONSTRAINT "offer_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bonus_wallets" DROP CONSTRAINT "bonus_wallets_user_id_fkey";
ALTER TABLE "bonus_wallets" ADD CONSTRAINT "bonus_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vip_upgrade_logs" DROP CONSTRAINT "vip_upgrade_logs_user_id_fkey";
ALTER TABLE "vip_upgrade_logs" ADD CONSTRAINT "vip_upgrade_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referrer_id_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referred_id_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_commissions" DROP CONSTRAINT "referral_commissions_referrer_id_fkey";
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_commissions" DROP CONSTRAINT "referral_commissions_referred_id_fkey";
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_commissions" DROP CONSTRAINT "referral_commissions_referral_id_fkey";
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_loss_commissions" DROP CONSTRAINT "referral_loss_commissions_referrer_id_fkey";
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_loss_commissions" DROP CONSTRAINT "referral_loss_commissions_referred_id_fkey";
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_loss_commissions" DROP CONSTRAINT "referral_loss_commissions_source_bettor_id_fkey";
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_source_bettor_id_fkey" FOREIGN KEY ("source_bettor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_loss_commissions" DROP CONSTRAINT "referral_loss_commissions_referral_id_fkey";
ALTER TABLE "referral_loss_commissions" ADD CONSTRAINT "referral_loss_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cashback_grants" DROP CONSTRAINT "cashback_grants_user_id_fkey";
ALTER TABLE "cashback_grants" ADD CONSTRAINT "cashback_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "login_streak_logs" DROP CONSTRAINT "login_streak_logs_user_id_fkey";
ALTER TABLE "login_streak_logs" ADD CONSTRAINT "login_streak_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
