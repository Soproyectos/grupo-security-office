import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogJobsService, EnqueueDto } from './catalog-jobs.service';

/** Entrada de encolado (el scope se valida Y se resuelve por alcance en el servidor). */
export class EnqueueJobDto {
  @ApiProperty({ enum: ['VALIDATION_SCAN', 'EXPORT_BUNDLE'], description: 'Tipo de trabajo (kind conocido por el trabajador)' })
  @IsString()
  kind: string;

  @ApiProperty({ description: "{mode:'ids',ids:[…]} | {mode:'filters',listaId?,search?,lifecycleStatus?}", type: 'object', additionalProperties: true })
  @IsObject()
  scope: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Clave de reintento: reencolar la misma clave devuelve el trabajo existente (nunca un duplicado)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  retryKey?: string;
}

const ALL_ROLES = ['Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta'] as const

/**
 * CAT-07 — API del trabajador común. El encolado exige la acción SUBYACENTE del
 * kind (regla 1: sin colas con permisos propios duplicados); la lectura y la
 * cancelación son del DUEÑO (o admin); el trabajo ajeno es 404 idéntico al
 * inexistente — no revela existencia (caso 2).
 */
@ApiTags('Catalog Jobs')
@ApiBearerAuth()
@Controller('api/catalog-jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
export class CatalogJobsController {
  constructor(private readonly jobs: CatalogJobsService) {}

  private ctx(user: any): { userId: string; roles: string[] } {
    return { userId: user?.sub ?? user?.id ?? '', roles: user?.roles ?? [] };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Encolar un trabajo (el alcance se materializa y se re-verifica al ejecutar)' })
  @ApiResponse({ status: 201, description: '{ job, reused } — reused=true si el retryKey ya existía' })
  @ApiResponse({ status: 403, description: 'Sin la acción subyacente del kind (con concesiones vigentes)' })
  enqueue(@Body() dto: EnqueueJobDto, @CurrentUser() user: any) {
    // El servicio re-valida kind y scope (el DTO solo da forma al body).
    return this.jobs.enqueue(dto as unknown as EnqueueDto, this.ctx(user));
  }

  @Get()
  @ApiOperation({ summary: 'Mis trabajos (los administradores ven los recientes de todos)' })
  list(@CurrentUser() user: any) {
    return this.jobs.listMine(this.ctx(user))
  }

  @Get(':id')
  @ApiOperation({ summary: 'Progreso de un trabajo (dueño o admin; ajeno = 404 sin revelar)' })
  @ApiResponse({ status: 200, description: '{ state, progressDone, progressTotal, resultSummary?, error? }' })
  @ApiResponse({ status: 404, description: 'Inexistente o ajeno (idéntico a propósito)' })
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobs.get(id, this.ctx(user))
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar (QUEUED inmediato; RUNNING cooperativo entre unidades)' })
  @ApiResponse({ status: 409, description: 'job-state-conflict si el trabajo ya terminó' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobs.cancel(id, this.ctx(user))
  }
}

/** Historial de TRABAJOS de un recurso — sin acceso global a auditoría (regla 3). */
@ApiTags('Catalog Jobs')
@ApiBearerAuth()
@Controller('api/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
export class CatalogJobsHistoryController {
  constructor(private readonly jobs: CatalogJobsService) {}

  private ctx(user: any): { userId: string; roles: string[] } {
    return { userId: user?.sub ?? user?.id ?? '', roles: user?.roles ?? [] };
  }

  @Get(':id/job-history')
  @ApiOperation({ summary: 'Qué trabajos tocaron este recurso (unidad+estado); errores solo para administradores' })
  history(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobs.historyForProduct(id, this.ctx(user))
  }
}
