import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { WithdrawalSettingsService } from './withdrawal-settings.service';
import { UpdateWithdrawalSettingsDto } from './dto/update-withdrawal-settings.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('withdrawal-settings')
export class WithdrawalSettingsController {
  constructor(
    private readonly withdrawalSettingsService: WithdrawalSettingsService,
  ) {}

  // Public — the bet site's withdraw page reads this with no auth to know
  // which verification section(s) to show, same trust model as
  // PaymentAccountsController's public GET.
  @Get()
  get() {
    return this.withdrawalSettingsService.get();
  }

  @UseGuards(ApiKeyGuard)
  @Patch()
  update(@Body() dto: UpdateWithdrawalSettingsDto) {
    return this.withdrawalSettingsService.update(dto);
  }
}
