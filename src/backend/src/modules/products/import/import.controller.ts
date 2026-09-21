import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ImportService } from './import.service';
import { PreviewImportDto, ExecuteImportDto } from './dto/preview-import.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ALL_ROLES } from '../../../common/rbac/roles.constants';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

@ApiTags('Products - Importación')
@ApiBearerAuth()
@Controller('api/products/import')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * La estrategia JWT del proyecto entrega `sub` (nunca `id`). Helper único para
   * resolver el userId del actor en cualquier handler (mismo patrón que el resto
   * de controllers: `user?.sub ?? user?.id`).
   */
  private userId(req: any): string {
    return req.user?.sub ?? req.user?.id;
  }

  /**
   * FASE 1: Preview — Analiza el archivo sin modificar la BD.
   * Retorna: headers detectados, mapeos sugeridos, validación de filas.
   */
  @Post('preview')
  @Roles('Super Admin', 'Admin Comercial')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Vista previa de importación (dry-run)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        headerRowIndex: { type: 'number', default: 0 },
        columnMappings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sourceColumn: { type: 'string' },
              targetField: { type: 'string' },
            },
          },
        },
        presetId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Preview generado exitosamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o mapping incompleto' })
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() req: any,
  ) {
    const dto: PreviewImportDto = {
      headerRowIndex: body.headerRowIndex ? parseInt(body.headerRowIndex) : undefined,
      columnMappings: body.columnMappings
        ? JSON.parse(body.columnMappings)
        : undefined,
      presetId: body.presetId,
      listaId: body.listaId,
    };

    return this.importService.preview(
      file.buffer,
      file.originalname,
      this.userId(req),
      dto,
    );
  }

  /**
   * FASE 2: Execute — Valida y arranca la importación real en segundo plano.
   * Requiere que se haya ejecutado preview previamente. No espera a que el
   * batch termine (SEC-IMPORT-002): responde de inmediato con `status:
   * 'processing'` y el cliente sondea `GET .../progress/:importId` hasta ver
   * el resultado final.
   */
  @Post('execute')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(201)
  @ApiOperation({ summary: 'Iniciar ejecución de importación (arranca en segundo plano)' })
  @ApiResponse({ status: 201, description: 'Importación iniciada. Sondear /progress/:importId para el resultado.' })
  @ApiResponse({ status: 400, description: 'Importación no encontrada o mapping incompleto' })
  async execute(
    @Body() dto: ExecuteImportDto,
    @Req() req: any,
  ) {
    return this.importService.execute(
      dto.importId,
      {
        columnMappings: dto.columnMappings,
        ivaMode: dto.ivaMode,
        headerRowIndex: dto.headerRowIndex,
        presetName: dto.presetName,
        listaId: dto.listaId,
        sections: dto.sections,
        fixedValues: dto.fixedValues,
      },
      this.userId(req),
    );
  }

  /**
   * Progreso de una importación activa.
   *
   * `@SkipThrottle`: el límite global es 20 peticiones/min por IP, pensado
   * para frenar fuerza bruta en endpoints como login — no para un endpoint
   * de solo lectura, autenticado, hecho justamente para sondearse cada
   * pocos segundos (SEC-IMPORT-002). Sin esto, el propio sondeo del wizard
   * agota el límite en menos de un minuto y el usuario ve un 429 a mitad de
   * su propia importación.
   */
  @Get('progress/:importId')
  @Roles('Super Admin', 'Admin Comercial')
  @SkipThrottle()
  @ApiOperation({ summary: 'Consultar progreso de importación' })
  @ApiResponse({ status: 200, description: 'Progreso de la importación' })
  async getProgress(@Param('importId') importId: string) {
    return this.importService.getProgress(importId);
  }

  // === Presets de Mapping ===

  /**
   * Precio vigente por SKU para el wizard de importación (comparación
   * "precio actual vs nuevo"). Se resuelve por SKU exacto (case-insensitive)
   * dentro de la lista destino (listaId opcional). Accesible a los 5 roles:
   * la lectura de precio por SKU no exige ACL por lista — el usuario ya tiene
   * acceso al módulo de importación. El interceptor global envuelve en `{ data }`.
   * Se declara ANTES de cualquier ruta con segmento dinámico.
   */
  @Get('current-price')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Precio vigente por SKU (wizard de importación)' })
  @ApiQuery({ name: 'sku', required: true, description: 'SKU exacto (case-insensitive)' })
  @ApiQuery({ name: 'listaId', required: false, description: 'Lista destino de la importación' })
  @ApiResponse({
    status: 200,
    description: '{ data: { sku, productId, name, price, currency, validUntil, exists } | null }',
  })
  getCurrentPrice(
    @Query('sku') sku: string,
    @Query('listaId') listaId?: string,
  ) {
    return this.importService.getCurrentPriceBySku(sku, listaId);
  }

  /**
   * Versión agrupada de `current-price`: resuelve varios SKUs en una sola
   * petición. El wizard debe usar este endpoint (no N llamadas a
   * `current-price`) para el paso de comparación de precios — con listas
   * grandes, N llamadas paralelas agotan el rate-limit global (429 en
   * cascada) y tumban el paso siguiente de la importación.
   */
  @Post('current-prices')
  @Roles(...ALL_ROLES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Precio vigente por SKU, en lote (wizard de importación)' })
  @ApiResponse({
    status: 200,
    description: '{ data: ({ sku, productId, name, price, currency, validUntil, exists } | null)[] }',
  })
  getCurrentPrices(
    @Body() body: { skus: string[]; listaId?: string },
  ) {
    return this.importService.getCurrentPricesBySkus(body?.skus ?? [], body?.listaId);
  }

  @Get('mappings')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Listar presets de mapping del usuario' })
  async listPresets(@Req() req: any) {
    return this.importService.listPresets(this.userId(req));
  }

  @Post('mappings')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(201)
  @ApiOperation({ summary: 'Guardar preset de mapping' })
  async savePreset(
    @Body() body: { name: string; mapping: any; isDefault?: boolean },
    @Req() req: any,
  ) {
    return this.importService.savePreset(
      body.mapping,
      body.name,
      this.userId(req),
      body.isDefault,
    );
  }

  @Delete('mappings/:id')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar preset de mapping' })
  async deletePreset(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.importService.deletePreset(id, this.userId(req));
  }
}
