import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentAccountsService } from './payment-accounts.service';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';
import { UpdatePaymentAccountDto } from './dto/update-payment-account.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('payment-accounts')
export class PaymentAccountsController {
  constructor(
    private readonly paymentAccountsService: PaymentAccountsService,
  ) {}

  // Public — the bet site's Deposit/Withdraw page reads this directly to
  // show players where to send money, so only active accounts are exposed.
  @Get()
  findAllActive() {
    return this.paymentAccountsService.findAllActive();
  }

  // Authenticated — a logged-in player's Deposit/Withdraw page uses this
  // instead, so a 'commission'-type agent's number can be shown to that
  // agent's own referred player without exposing it to everyone else.
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findAllActiveForUser(@Req() req: { user: { userId: string } }) {
    return this.paymentAccountsService.findAllActiveForUser(
      BigInt(req.user.userId),
    );
  }

  @UseGuards(ApiKeyGuard)
  @Get('admin')
  findAll() {
    return this.paymentAccountsService.findAll();
  }

  @UseGuards(ApiKeyGuard)
  @Post()
  create(@Body() dto: CreatePaymentAccountDto) {
    return this.paymentAccountsService.create(dto);
  }

  @UseGuards(ApiKeyGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentAccountDto) {
    return this.paymentAccountsService.update(id, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.paymentAccountsService.setActive(id, dto.isActive);
  }

  @UseGuards(ApiKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentAccountsService.remove(id);
  }
}
