import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { concessionCanAction } from '../../common/security/d5-action';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZonesService } from './zones.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';

/** Advisor zones: Super Admin, or whoever was given the `portalZones:manage` panel action. */
@ApiTags('Zones')
@ApiBearerAuth()
@Controller('api/zones')
@UseGuards(JwtAuthGuard)
export class ZonesController {
  constructor(private readonly zones: ZonesService, private readonly grants: AccessAssignmentsService) {}

  private async assertAllowed(user: any) {
    const decision = await concessionCanAction(this.grants, 'portalZones:manage', { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] });
    if (!decision.allowed) throw new ForbiddenException('No tienes permiso para gestionar zonas');
  }

  @Get()
  async list(@CurrentUser() user: any) { await this.assertAllowed(user); return this.zones.list(); }

  @Post()
  async create(@Body() dto: CreateZoneDto, @CurrentUser() user: any) { await this.assertAllowed(user); return this.zones.create(dto, user?.sub ?? user?.id); }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateZoneDto, @CurrentUser() user: any) {
    await this.assertAllowed(user);
    return this.zones.update(id, dto, user?.sub ?? user?.id);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: any) { await this.assertAllowed(user); return this.zones.remove(id, user?.sub ?? user?.id); }
}
