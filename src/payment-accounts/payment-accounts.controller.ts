import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaymentAccountsService } from './payment-accounts.service';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller('payment-accounts')
export class PaymentAccountsController {
  constructor(
    private readonly paymentAccountsService: PaymentAccountsService,
  ) {}

  @Get()
  findAll() {
    return this.paymentAccountsService.findAll();
  }

  @Post()
  create(@Body() dto: CreatePaymentAccountDto) {
    return this.paymentAccountsService.create(dto);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.paymentAccountsService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentAccountsService.remove(id);
  }
}
