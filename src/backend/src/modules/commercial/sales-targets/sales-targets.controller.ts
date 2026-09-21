import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SalesTargetsService } from './sales-targets.service';
import { SalesTargetQueryDto } from './dto/sales-target-query.dto';
import { UpsertSalesTargetDto } from './dto/upsert-sales-target.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AccessContext } from '../../../common/acl/acl.service';
import { COMMERCIAL_READ_ROLES } from '../../../common/rbac/roles.constants';

const ALL_ROLES = COMMERCIAL_READ_ROLES;

@ApiTags('Commercial - Sales Targets')
@ApiBearerAuth()
@Controller('api/commercial/sales-targets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesTargetsController {
  constructor(private readonly salesTargetsService: SalesTargetsService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary:
      'Listar metas comerciales (?userId=&from=YYYY-MM&to=YYYY-MM). Propias siempre; ajenas solo si ancestro o admin',
  })
  findAll(@CurrentUser() user: any, @Query() query: SalesTargetQueryDto) {
    return this.salesTargetsService.findAll(query, this.ctx(user));
  }

  @Post()
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary:
      'Fijar (upsert) la meta de un usuario por (userId, period). Solo ancestro jerárquico o Super Admin/Admin Comercial',
  })
  upsert(@CurrentUser() user: any, @Body() dto: UpsertSalesTargetDto) {
    return this.salesTargetsService.upsert(dto, this.ctx(user));
  }
}
