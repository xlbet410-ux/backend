import { Body, Controller, Delete, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ResetPlatformDataDto } from './dto/reset-platform-data.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Same trust model as every other /admin route — API key, called
// server-side by the CRM only.
@UseGuards(ApiKeyGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Irreversible — see AdminService.resetPlatformData for exactly what
  // this deletes and what it deliberately leaves alone.
  @Delete('reset-platform-data')
  resetPlatformData(@Body() dto: ResetPlatformDataDto) {
    return this.adminService.resetPlatformData(dto.confirm);
  }
}
