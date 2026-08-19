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
import { RequestSettlementDto } from './dto/request-settlement.dto';
import { ResolveSettlementDto } from './dto/resolve-settlement.dto';
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

  // Commission wallet: earned (all-time, deposit-capped — same figure
  // getReferrals shows) minus settled/pending. See getWalletSummary.
  @Get(':id/wallet')
  getWallet(@Param('id') id: string) {
    return this.agentsService.getWalletSummary(id);
  }

  @Get(':id/wallet/history')
  getWalletHistory(@Param('id') id: string) {
    return this.agentsService.getSettlementHistory(id);
  }

  // Staff-facing queue across every agent — not scoped to one id, so this
  // must stay a distinct path segment count from ':id' routes above.
  // ?status=pending|completed|rejected filters; omitted returns all.
  @Get('wallet/settlements')
  getAllSettlements(@Query('status') status?: string) {
    return this.agentsService.getAllSettlements(status);
  }

  // Cross-agent commission vs. platform split for the staff settlement
  // queue. ?period=day|week|month (optionally &date=YYYY-MM-DD for day)
  // restricts to that window; omitted = all-time.
  @Get('wallet/commission-summary')
  getCommissionSummary(@Query() query: GetReferralsQueryDto) {
    return this.agentsService.getCommissionSummary(query.period, query.date);
  }

  // Agent requests payout of their own requestable balance.
  @Post(':id/wallet/settlements')
  requestSettlement(@Param('id') id: string, @Body() dto: RequestSettlementDto) {
    return this.agentsService.requestSettlement(id, dto.amount, dto.note);
  }

  // Staff confirms/rejects a pending request — looked up by its own id,
  // not scoped under an agent id (mirrors how CashTransaction resolve
  // routes work: /transactions/:id/approve, not /agents/:id/transactions/:txId/approve).
  @Patch('wallet/settlements/:settlementId/confirm')
  confirmSettlement(@Param('settlementId') settlementId: string, @Body() dto: ResolveSettlementDto) {
    return this.agentsService.confirmSettlement(settlementId, dto.confirmedByUsername);
  }

  @Patch('wallet/settlements/:settlementId/reject')
  rejectSettlement(@Param('settlementId') settlementId: string, @Body() dto: ResolveSettlementDto) {
    return this.agentsService.rejectSettlement(settlementId, dto.confirmedByUsername);
  }
}
