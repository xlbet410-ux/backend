import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { SendSingleMessageDto } from './dto/send-single-message.dto';
import { SendLevelMessageDto } from './dto/send-level-message.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Admin-only — called by the CRM server-side, same trust model as every
// other /admin route in this app: API key, not end-user auth.
@UseGuards(ApiKeyGuard)
@Controller('admin/messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('single')
  async sendSingle(@Body() dto: SendSingleMessageDto) {
    await this.messagingService.sendSingle(dto.phoneNumber, dto.message);
    return { success: true };
  }

  @Post('by-level')
  sendByLevel(@Body() dto: SendLevelMessageDto) {
    const level = dto.level === 'all' ? 'all' : Number(dto.level);
    return this.messagingService.sendToLevel(level, dto.message);
  }
}
