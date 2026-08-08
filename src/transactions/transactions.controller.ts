import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';
import { ResolveCashTransactionDto } from './dto/resolve-cash-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('cash-in')
  createCashIn(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateCashTransactionDto,
  ) {
    return this.transactionsService.createCashIn(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cash-out')
  createCashOut(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateCashTransactionDto,
  ) {
    return this.transactionsService.createCashOut(req.user.userId, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Get('cash-in')
  findCashIn() {
    return this.transactionsService.findCashIn();
  }

  @UseGuards(ApiKeyGuard)
  @Get('cash-out')
  findCashOut() {
    return this.transactionsService.findCashOut();
  }

  @UseGuards(ApiKeyGuard)
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string, @Body() dto: ResolveCashTransactionDto) {
    return this.transactionsService.approve(id, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: ResolveCashTransactionDto) {
    return this.transactionsService.reject(id, dto);
  }
}
