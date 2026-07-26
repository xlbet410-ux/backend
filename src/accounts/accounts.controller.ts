import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountLoginDto } from './dto/login.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll() {
    return this.accountsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.accountsService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountsService.remove(id);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AccountLoginDto) {
    return this.accountsService.login(dto);
  }
}
