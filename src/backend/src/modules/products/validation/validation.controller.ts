import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AccessContext } from '../../../common/acl/acl.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ProductValidationService } from './validation.service';
import { PublicationBoardService } from './publication-board.service';

/** Selección para validación por lote (CAT-05; el trabajo con filtros completos es CAT-07). */
export class BatchValidationDto {
  @ApiProperty({ type: [String], description: 'Ids de producto seleccionados (máx. 200).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  productIds: string[];
}

/**
 * CAT-05 `backend-api` — un solo motor, varios puntos de entrada (diseño §6):
 * individual (POST), informe vigente (GET) y selección (batch). Autorización:
 * acción `products:validate` (transición D5) + ACL de lectura del producto; el
 * batch respeta el alcance por producto sin revelar lo ajeno (`omitted`).
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Operador', 'Consulta')
export class ProductValidationController {
  constructor(
    private readonly validation: ProductValidationService,
    private readonly board: PublicationBoardService,
  ) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Post('validation/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar una selección de productos (respecta alcance; tope 200)' })
  @ApiResponse({ status: 200, description: 'Resumen examinados/válidos/con errores/omitidos/fallidos' })
  @ApiResponse({ status: 400, description: 'Selección vacía o sobre el tope' })
  @ApiResponse({ status: 403, description: 'Sin products:validate (con concesiones vigentes)' })
  batch(@Body() dto: BatchValidationDto, @CurrentUser() user: any) {
    return this.validation.validateBatch(dto.productIds, this.ctx(user));
  }

  @Post(':id/validation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar el producto y persistir el informe en su revisión de trabajo' })
  @ApiResponse({ status: 200, description: '{ status, issues, rulesVersion, at, revisionId }' })
  @ApiResponse({ status: 403, description: 'Sin products:validate o ACL' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado/oculto' })
  validate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.validation.validateOne(id, this.ctx(user));
  }

  @Get(':id/validation')
  @ApiOperation({ summary: 'Último informe de validación con bandera de obsoleto (editar invalida)' })
  @ApiResponse({ status: 200, description: 'Informe o null si nunca se validó' })
  @ApiResponse({ status: 403, description: 'Sin products:validate o ACL' })
  report(@Param('id') id: string, @CurrentUser() user: any) {
    return this.validation.reportOf(id, this.ctx(user));
  }

  /**
   * CAT-06 (P4): historial de publicación del producto (quién/qué revisión/
   * cuándo/resultado — incluye los bloqueos, que jamás se pierden en silencio).
   * ACL de lectura: lo que el producto oculta al lector, también oculta su
   * historial (404/403 según la capa heredada).
   */
  @Get(':id/publication-history')
  @ApiOperation({ summary: 'Historial de publicación/programación del producto' })
  @ApiResponse({ status: 200, description: 'Eventos (≤200, más recientes primero)' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado/oculto' })
  history(@Param('id') id: string, @CurrentUser() user: any) {
    return this.board.productHistory(id, this.ctx(user));
  }
}
