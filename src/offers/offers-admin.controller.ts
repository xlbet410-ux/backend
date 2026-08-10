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
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Admin-only — called by the CRM server-side (same trust model as every
// other /admin-style route in this app: API key, not end-user auth).
@UseGuards(ApiKeyGuard)
@Controller('admin/offers')
export class OffersAdminController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.offersService.findAllAdmin({
      category,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.offersService.findOneAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateOfferDto) {
    return this.offersService.createOffer(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.offersService.updateOffer(id, dto);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.offersService.softDeleteOffer(id);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.offersService.toggleActive(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.offersService.duplicateOffer(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.offersService.getOfferStats(id);
  }
}
