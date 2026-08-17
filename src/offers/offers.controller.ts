import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OffersService } from './offers.service';
import { BonusService } from '../bonus/bonus.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Player-facing routes. Static sub-paths (applicable-for-deposit,
// my-bonuses, bonuses/:id/forfeit) are declared before the dynamic
// :slug/claim route so none of them can ever be swallowed by it.
@Controller('offers')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly bonusService: BonusService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query('category') category?: string) {
    return this.offersService.listForUser(undefined, category);
  }

  // Public — the homepage popup shows to guests too, not just logged-in
  // players.
  @Get('popup')
  popup() {
    return this.offersService.getPopupOffers();
  }

  @UseGuards(JwtAuthGuard)
  @Get('applicable-for-deposit')
  applicableForDeposit(
    @Query('amount') amount: string,
    @Req() req: { user: { userId: string } },
  ) {
    if (!amount || Number.isNaN(Number(amount))) {
      throw new BadRequestException('A valid amount is required.');
    }
    return this.offersService.getApplicableDepositOffers(
      BigInt(req.user.userId),
      new Prisma.Decimal(amount),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-bonuses')
  myBonuses(@Req() req: { user: { userId: string } }) {
    return this.bonusService.getUserBonuses(BigInt(req.user.userId));
  }

  // Powers the wallet page's "locked (pending turnover)" section — shows
  // how much is withdrawable right now vs. held back by an active bonus.
  @UseGuards(JwtAuthGuard)
  @Get('withdrawable')
  withdrawable(@Req() req: { user: { userId: string } }) {
    return this.bonusService.canWithdraw(BigInt(req.user.userId));
  }

  // Powers the wallet page's Main Wallet / Turnover Wallet split.
  @UseGuards(JwtAuthGuard)
  @Get('wallet-summary')
  walletSummary(@Req() req: { user: { userId: string } }) {
    return this.bonusService.getWalletSummary(BigInt(req.user.userId));
  }

  @UseGuards(JwtAuthGuard)
  @Post('bonuses/:id/forfeit')
  forfeit(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
    return this.bonusService.forfeitBonus(BigInt(req.user.userId), BigInt(id));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/claim')
  async manualClaim(
    @Param('slug') slug: string,
    @Req() req: { user: { userId: string } },
  ) {
    const offer = await this.prisma.offer.findUnique({ where: { slug } });
    if (!offer || offer.triggerType !== 'manual_claim') {
      throw new NotFoundException('This offer is not claimable.');
    }

    // processTrigger() silently no-ops when the player isn't eligible (already
    // claimed, budget exhausted, etc.) rather than throwing — so success here
    // isn't proof a claim actually happened. Query for a claim row created
    // during this exact call to know for sure, and to surface the actual
    // reward amount (needed for the "how much did I win" reveal on a
    // random-reward offer like Red Envelope Rain).
    const before = new Date();
    await this.offersService.processTrigger({
      type: 'manual_claim',
      userId: BigInt(req.user.userId),
      offerId: offer.id,
    });
    const claim = await this.prisma.offerClaim.findFirst({
      where: {
        offerId: offer.id,
        userId: BigInt(req.user.userId),
        claimedAt: { gte: before },
      },
      orderBy: { claimedAt: 'desc' },
    });
    if (!claim) {
      throw new BadRequestException("You're not eligible to claim this offer right now.");
    }
    return { success: true, rewardAmount: claim.rewardAmount.toString() };
  }
}
