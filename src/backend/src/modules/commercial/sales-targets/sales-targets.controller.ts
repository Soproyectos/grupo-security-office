import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SalesTargetsService, SalesTargetsAccessContext } from './sales-targets.service';
import { SalesTargetQueryDto } from './dto/sales-target-query.dto';
import { UpsertSalesTargetDto } from './dto/upsert-sales-target.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

@ApiTags('Commercial - Sales Targets')
@ApiBearerAuth()
@Controller('api/commercial/sales-targets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesTargetsController {
  constructor(private readonly salesTargetsService: SalesTargetsService) {}

  /** Identidad autenticada y sesión viva para resolver concesiones actuales. */
  private ctx(user: any): SalesTargetsAccessContext {
    return {
      userId: user?.sub ?? user?.id,
      roles: user?.roles ?? [],
      jti: user?.jti,
    };
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar metas comerciales (?userId=&from=YYYY-MM&to=YYYY-MM) dentro del alcance targets:read vigente',
  })
  findAll(@CurrentUser() user: any, @Query() query: SalesTargetQueryDto) {
    return this.salesTargetsService.findAll(query, this.ctx(user));
  }

  @Post()
  @ApiOperation({
    summary:
      'Fijar (upsert) la meta de un usuario por (userId, period). Requiere concesión targets:edit con alcance sobre el dueño (COM-04)',
  })
  upsert(@CurrentUser() user: any, @Body() dto: UpsertSalesTargetDto) {
    return this.salesTargetsService.upsert(dto, this.ctx(user));
  }
}
