import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
export class GamesController {
  private readonly logger = new Logger(GamesController.name);

  constructor(private readonly gamesService: GamesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('games/launch')
  launch(@Req() req: { user: { userId: string } }, @Body() dto: LaunchGameDto) {
    return this.gamesService.launchGame(req.user.userId, dto.gameUid);
  }

  @Get('games/catalog/counts')
  getCatalogCounts() {
    return this.gamesService.getCatalogCounts();
  }

  @Get('games/catalog')
  getCatalog(@Query() query: GetCatalogQueryDto) {
    return this.gamesService.getCatalogPage(
      query.category,
      query.page,
      query.pageSize,
      query.tag,
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

  // Oracle pings this with GET during onboarding/verification.
  @Get('games/callback')
  @HttpCode(HttpStatus.OK)
  ping(@Query() query: Record<string, unknown>) {
    this.logger.log(`GET ping received: ${JSON.stringify(query)}`);
    return { status: 'OK' };
  }

  // Oracle posts every bet/win event here; we must respond with the
  // player's updated balance after applying it.
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
}
