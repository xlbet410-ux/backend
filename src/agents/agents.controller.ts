import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentLoginDto } from './dto/agent-login.dto';
import { AgentChangePasswordDto } from './dto/agent-change-password.dto';
import { GetReferralsQueryDto } from './dto/get-referrals-query.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Every route here is API-key gated, called server-side by the CRM only —
// agent login/session state lives in the CRM's own cookie session, not a
// token issued by this backend (mirrors how staff Account login works).
@UseGuards(ApiKeyGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  findAll() {
    return this.agentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.agentsService.remove(id);
  }

  @Post('login')
  login(@Body() dto: AgentLoginDto) {
    return this.agentsService.login(dto);
  }

  @Patch(':id/change-password')
  changePassword(@Param('id') id: string, @Body() dto: AgentChangePasswordDto) {
    return this.agentsService.changePassword(id, dto);
  }

  // Per-referred-player deposit/withdraw/wagered/won/loss/commission
  // breakdown for this agent's own dashboard, and the CRM's admin
  // agent-detail view. ?period=day|week|month (optionally &date=YYYY-MM-DD
  // for day) restricts every figure to that window; omitted = all-time.
  @Get(':id/referrals')
  getReferrals(@Param('id') id: string, @Query() query: GetReferralsQueryDto) {
    return this.agentsService.getReferredPlayerStats(id, query.period, query.date);
  }
}
