import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('pages')
  findAllPages() {
    return this.rolesService.findAllPages();
  }

  @Get('roles')
  findAll() {
    return this.rolesService.findAll();
  }

  @Post('roles')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Delete('roles/:id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
