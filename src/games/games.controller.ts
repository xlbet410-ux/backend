import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { GamesService } from './games.service';
import { LaunchGameDto } from './dto/launch-game.dto';
import {
  GetCatalogQueryDto,
  GetSubTagCountsQueryDto,
} from './dto/get-catalog.dto';
import { SearchCatalogQueryDto } from './dto/search-catalog.dto';
import { GetCategoryProvidersDto } from './dto/get-category-providers.dto';
import { GetProviderCatalogDto } from './dto/get-provider-catalog.dto';
import { AdminListGamesQueryDto } from './dto/admin-list-games.dto';
import { SetGameOverrideDto } from './dto/set-game-override.dto';
import { SetGameStatusDto } from './dto/set-game-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller()
export class GamesController {
  private readonly logger = new Logger(GamesController.name);

  constructor(
    private readonly gamesService: GamesService,
    private readonly config: ConfigService,
  ) {}

  // Constant-time compare so a mismatched secret can't be brute-forced via
  // response-timing differences.
  private checkCallbackSecret(secret: string): void {
    const expected = this.config.get<string>('GAMES_CALLBACK_SECRET');
    if (!expected) {
      // Fails closed: if the operator hasn't set the secret yet, nobody
      // (including a correctly-configured provider) can hit this route —
      // safer than accidentally accepting an unauthenticated callback.
      throw new NotFoundException();
    }
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotFoundException();
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('games/launch')
  launch(@Req() req: { user: { userId: string } }, @Body() dto: LaunchGameDto) {
    return this.gamesService.launchGame(req.user.userId, dto.gameUid);
  }

  @Get('games/catalog/counts')
  getCatalogCounts() {
    return this.gamesService.getCatalogCounts();
  }

  @UseGuards(JwtAuthGuard)
  @Get('games/history')
  getMyGameHistory(
    @Req() req: { user: { userId: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.gamesService.getMyGameHistory(
      BigInt(req.user.userId),
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  // Public route, but personalizes the Featured section for whoever happens
  // to be logged in — OptionalJwtAuthGuard never rejects a guest/expired
  // request, it just leaves req.user unset.
  @UseGuards(OptionalJwtAuthGuard)
  @Get('games/catalog')
  getCatalog(
    @Req() req: { user?: { userId: string } },
    @Query() query: GetCatalogQueryDto,
  ) {
    return this.gamesService.getCatalogPage(
      query.category,
      query.page,
      query.pageSize,
      query.tag,
      query.providerCode,
      query.sort,
      req.user?.userId ? BigInt(req.user.userId) : undefined,
    );
  }

  @Get('games/catalog/subtags')
  getSubTagCounts(@Query() query: GetSubTagCountsQueryDto) {
    return this.gamesService.getSubTagCounts(query.category);
  }

  @Get('games/catalog/search')
  searchCatalog(@Query() query: SearchCatalogQueryDto) {
    return this.gamesService.searchCatalog(query.q);
  }

  @Get('games/providers')
  getProviders() {
    return this.gamesService.getProviders();
  }

  @Get('games/providers/:code')
  getProviderGames(@Param('code') code: string) {
    return this.gamesService.getProviderGames(code);
  }

  @Get('games/catalog/category-providers')
  getCategoryProviders(@Query() query: GetCategoryProvidersDto) {
    return this.gamesService.getCategoryProviders(query.category);
  }

  @Get('games/catalog/all-providers')
  getAllProviders() {
    return this.gamesService.getAllProviders();
  }

  @Get('games/catalog/provider')
  getProviderCatalog(@Query() query: GetProviderCatalogDto) {
    return this.gamesService.getProviderCatalog(
      query.code,
      query.page,
      query.pageSize,
      query.sort,
    );
  }

  // --- UNAUTHENTICATED — being retired ---
  // These accept a balance-mutating callback from ANYONE, not just Oracle.
  // Kept temporarily so live game processing doesn't break mid-migration;
  // delete both once Oracle's dashboard is confirmed pointed at the new
  // /games/callback/:secret routes below and a real bet has round-tripped
  // successfully through them.
  // Skip the global ThrottlerGuard — this is a server-to-server webhook
  // Oracle calls once per settled bet across every player on the platform,
  // not end-user traffic the throttle is meant to protect against. Even
  // with per-visitor limiting correctly restored (see main.ts trust proxy),
  // Oracle's aggregate callback volume during real play (auto-spin/turbo
  // especially) can easily exceed a player-sized rate limit — and a
  // throttled callback means Oracle never gets the updated balance it's
  // waiting on, which is exactly what a "insufficient balance" symptom on
  // the very next bet would look like from Oracle's side.
  @SkipThrottle()
  @Get('games/callback')
  @HttpCode(HttpStatus.OK)
  ping(@Query() query: Record<string, unknown>) {
    this.logger.log(`GET ping received: ${JSON.stringify(query)}`);
    return { status: 'OK' };
  }

  @SkipThrottle()
  @Post('games/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Body() body: Parameters<GamesService['handleCallback']>[0],
    @Req() req: Request,
  ) {
    this.logger.log(
      `POST callback received from ${req.ip}: ${JSON.stringify(body)}`,
    );
    return this.gamesService.handleCallback(body);
  }

  // --- Secret-protected replacements ---
  // The real fix: only someone who knows GAMES_CALLBACK_SECRET (set in env,
  // shared only with Oracle via this URL) can reach these. Point Oracle's
  // callback URL at these instead, then remove the two routes above.
  @SkipThrottle()
  @Get('games/callback/:secret')
  @HttpCode(HttpStatus.OK)
  pingSecure(
    @Param('secret') secret: string,
    @Query() query: Record<string, unknown>,
  ) {
    this.checkCallbackSecret(secret);
    this.logger.log(`GET ping received (secured): ${JSON.stringify(query)}`);
    return { status: 'OK' };
  }

  @SkipThrottle()
  @Post('games/callback/:secret')
  @HttpCode(HttpStatus.OK)
  async callbackSecure(
    @Param('secret') secret: string,
    @Body() body: Parameters<GamesService['handleCallback']>[0],
    @Req() req: Request,
  ) {
    this.checkCallbackSecret(secret);
    this.logger.log(
      `POST callback received (secured) from ${req.ip}: ${JSON.stringify(body)}`,
    );
    return this.gamesService.handleCallback(body);
  }

  // --- Admin (CRM) — Games section ---

  @UseGuards(ApiKeyGuard)
  @Get('games/admin/list')
  adminListGames(@Query() query: AdminListGamesQueryDto) {
    return this.gamesService.adminListGames(query);
  }

  @UseGuards(ApiKeyGuard)
  @Patch('games/admin/:gameUid/override')
  adminSetGameOverride(
    @Param('gameUid') gameUid: string,
    @Body() dto: SetGameOverrideDto,
  ) {
    return this.gamesService.adminSetGameOverride(gameUid, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Patch('games/admin/:gameUid/status')
  adminSetGameStatus(
    @Param('gameUid') gameUid: string,
    @Body() dto: SetGameStatusDto,
  ) {
    return this.gamesService.adminSetGameStatus(gameUid, dto.isActive, {
      name: dto.name,
      providerName: dto.providerName,
    });
  }
}
