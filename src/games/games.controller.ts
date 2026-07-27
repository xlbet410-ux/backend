import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

// Placeholder endpoint for a game provider's seamless-wallet callback.
// Every provider (Evolution, Pragmatic Play, Slotegrator, etc.) uses a
// different request/response contract and signature scheme, so until we
// have that provider's real API docs this just logs whatever arrives and
// returns a generic success response — enough for onboarding/ping checks
// to succeed against a real, reachable URL instead of a 404.
@Controller('games/callback')
export class GamesController {
  private readonly logger = new Logger(GamesController.name);

  @Get()
  @HttpCode(HttpStatus.OK)
  ping(@Query() query: Record<string, unknown>) {
    this.logger.log(`GET ping received: ${JSON.stringify(query)}`);
    return { status: 'OK' };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  receive(@Body() body: unknown, @Req() req: Request) {
    this.logger.log(`POST callback received from ${req.ip}: ${JSON.stringify(body)}`);
    return { status: 'OK' };
  }
}
