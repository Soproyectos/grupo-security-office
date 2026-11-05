import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, UploadedFile, UseInterceptors, GoneException, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductRevisionsService } from './product-revisions.service';
import { SaveProductDraftDto } from './dto/save-product-draft.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { PublishProductDto } from './dto/publish-product.dto';
import { UnpublishProductDto } from './dto/unpublish-product.dto';
import { TransitionProductDto } from './dto/transition.dto';
import { BulkTransitionProductDto } from './dto/bulk-transition.dto';
import { DeleteProductDto } from './dto/delete-product.dto';
import { BulkSchedulePublicationDto } from './dto/bulk-schedule-publication.dto';
import { SchedulePublicationDto } from './dto/schedule-publication.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireGrant } from '../../common/security/require-grant';
import { RedactInternalNotesInterceptor } from '../../common/security/internal-notes.interceptor';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/products')
@UseGuards(JwtAuthGuard, RolesGuard)
// Red de seguridad: ninguna respuesta de este controlador entrega `catalogInternalNotes` sin `products:notes`.
@UseInterceptors(RedactInternalNotesInterceptor)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productRevisionsService: ProductRevisionsService,
  ) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], userName: user?.name ?? null };
  }

  @Get('trending')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Obtener productos tendencia' })
  findTrending(
    @CurrentUser() user: any,
    @Query('take') take?: number,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findTrending({ take, categoryId, search }, this.ctx(user));
  }

  @Get('publish-scheduled')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Listar productos programados para publicaciÃ³n' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Inicio del rango (ISO). Default: ahora.' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Fin del rango (ISO). Default: ahora + 7 dÃ­as.' })
  findPublishScheduled(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.productsService.findPublishScheduled(from, to);
  }

  @Get()
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Listar productos' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Alias de take (paginación limit/offset); take tiene precedencia si se envían ambos' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'categoryIds', required: false, type: String, description: 'IDs de categorías separadas por coma; incluye sus descendientes' })
  @ApiQuery({ name: 'brandId', required: false, type: String })
  @ApiQuery({ name: 'isVisible', required: false, type: Boolean })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'activeListaOnly', required: false, type: Boolean })
  findAll(
    @Query() query: ProductQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.findAll({
      skip: query.skip ?? 0,
      take: query.take ?? query.limit ?? 50,
      search: query.search,
      categoryId: query.categoryId,
      categoryIds: query.categoryIds?.split(',').map((id) => id.trim()).filter(Boolean),
      brandId: query.brandId,
      isVisible: query.isVisible,
      isActive: query.isActive,
      activeListaOnly: query.activeListaOnly,
    }, this.ctx(user));
  }

  @Get(':id')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Obtener producto por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.findOne(id, this.ctx(user));
  }

  @Post()
  @RequireGrant('products:write')
  @ApiOperation({ summary: 'Crear producto' })
  @ApiResponse({ status: 201, description: 'Producto creado' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: any) {
    return this.productsService.create(dto, this.ctx(user));
  }

  @Put(':id')
  @RequireGrant('products:write')
  @ApiOperation({ summary: 'Actualizar producto' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: any) {
    return this.productsService.update(id, dto, this.ctx(user));
  }

  @Get(':id/revisions')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Versiones de revisión del producto (resumen, sin contenido)' })
  listRevisions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productRevisionsService.listRevisions(id, this.ctx(user));
  }

  @Patch(':id/revision/draft')
  @RequireGrant('products:write')
  @ApiOperation({
    summary: 'Guardar borrador versionado (CAT-02) — no toca la revisión publicada ni los activos',
  })
  saveDraft(@Param('id') id: string, @Body() dto: SaveProductDraftDto, @CurrentUser() user: any) {
    return this.productRevisionsService.saveDraft(id, dto, this.ctx(user));
  }

  @Patch(':id/toggle-visibility')
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Obsoleto', deprecated: true, description: 'Adaptador legacy: DRAFTâ†’PUBLISH, PUBLISHEDâ†’UNPUBLISH, ARCHIVEDâ†’400. No produce HIDDEN. Marcar reemplazado por POST /transition.' })
  toggleVisibility(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.toggleVisibility(id, this.ctx(user));
  }

  @Patch(':id/toggle-active')
  @RequireGrant('products:write')
  @ApiOperation({ summary: 'Eliminado', deprecated: true, description: 'Obsoleto: devuelve 410 Gone sin modificar el producto. Usa ARCHIVE o RESTORE vÃ­a POST /transition o POST /bulk-transition.' })
  toggleActive(@Param('id') _id: string) {
    throw new GoneException('toggle-active estÃ¡ obsoleto. Usa la transiciÃ³n canÃ³nica ARCHIVE o RESTORE.');
  }

  @Patch(':id/publish')
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Publicar o programar publicaciÃ³n de un producto (obsoleto)', deprecated: true, description: 'Sin publishAt futura: PUBLISH (DRAFTâ†’PUBLISHED). Con publishAt futura: persiste programaciÃ³n sobre DRAFT (el scheduler aplicarÃ¡ PUBLISH). unpublishAt se ignora. Reemplazado por POST /transition.' })
  @ApiResponse({ status: 200, description: 'Producto publicado o programado' })
  @ApiResponse({ status: 400, description: 'Requisitos previos a publicaciÃ³n no cumplidos (detalle)' })
  @ApiResponse({ status: 409, description: 'El producto ya estÃ¡ publicado' })
  publish(
    @Param('id') id: string,
    @Body() dto: PublishProductDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.publish(id, dto, this.ctx(user));
  }

  @Patch(':id/unpublish')
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Despublicar un producto (obsoleto)', deprecated: true, description: 'Ejecuta UNPUBLISH (PUBLISHEDâ†’DRAFT). Acepta reason opcional para auditorÃ­a. Reemplazado por POST /transition.' })
  @ApiResponse({ status: 200, description: 'Producto despublicado' })
  @ApiResponse({ status: 400, description: 'Motivo invÃ¡lido' })
  unpublish(
    @Param('id') id: string,
    @Body() dto: UnpublishProductDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.unpublish(id, dto, this.ctx(user));
  }

  @Post(':id/transition')
  // Requisito base products:read; el servicio exige ademas products:publish (PUBLISH/UNPUBLISH) o products:write (ARCHIVE/RESTORE) segun el evento.
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'TransiciÃ³n canÃ³nica de ciclo de vida de un producto (PUBLISH, UNPUBLISH, ARCHIVE, RESTORE)' })
  @ApiResponse({ status: 200, description: 'TransiciÃ³n aplicada. Devuelve el producto con allowedActions.' })
  @ApiResponse({ status: 400, description: 'TransiciÃ³n invÃ¡lida, motivo/confirm/publishAt faltante o checklist de publicaciÃ³n incumplido.' })
  @ApiResponse({ status: 403, description: 'Sin permisos RBAC o nivel ACL insuficiente.' })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionProductDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.transition(id, dto, this.ctx(user));
  }

  @Post('bulk-transition')
  // Requisito base products:read; cada producto exige el permiso de su evento en el servicio.
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Aplicar un evento FSM a varios productos (1..500). Procesa producto a producto; devuelve applied y rejected.' })
  @ApiResponse({ status: 201, description: 'Procesado. Respuesta: { data: { applied, rejected } }.' })
  bulkTransition(
    @Body() dto: BulkTransitionProductDto,
    @CurrentUser() user: any,
  ) {
    const { ids, event, reason, publishAt, unpublishAt, confirm } = dto;
    return this.productsService.bulkTransition(
      ids,
      { event, reason, publishAt, unpublishAt, confirm },
      this.ctx(user),
    );
  }

  @Delete(':id')
  @RequireGrant('products:delete')
  @ApiOperation({ summary: 'Eliminar producto fÃ­sicamente. Exige confirm: true; si el producto tiene datos asociados, exige masterKey (409 si falta, 403 si es incorrecta).' })
  @ApiResponse({ status: 200, description: 'Producto eliminado exitosamente' })
  @ApiResponse({ status: 400, description: 'Falta confirm: true' })
  @ApiResponse({ status: 403, description: 'Rol sin permiso, ACL sin manage o clave maestra incorrecta' })
  @ApiResponse({ status: 409, description: 'El producto tiene datos asociados y no se enviÃ³ masterKey' })
  remove(@Param('id') id: string, @Body() dto: DeleteProductDto, @CurrentUser() user: any) {
    return this.productsService.remove(id, dto, this.ctx(user));
  }

  @Post('import')
  @RequireGrant('products:write')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Importar productos desde Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Productos importados' })
  @ApiResponse({ status: 400, description: 'Archivo invÃ¡lido' })
  async importExcel(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.productsService.importFromExcel(file.buffer, this.ctx(user));
  }

  @Post(':id/images')
  @RequireGrant('products:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir imagen de producto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        isPrimary: { type: 'string', description: "'true' | 'false'", default: 'false' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Imagen subida' })
  @ApiResponse({ status: 400, description: 'Archivo invÃ¡lido o excede 8MB' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Body('isPrimary') isPrimary?: string,
  ) {
    return this.productsService.uploadImage(id, file, isPrimary === 'true', this.ctx(user));
  }

  @Post(':id/assets')
  @RequireGrant('products:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir un activo verificado de producto (IMAGE o DOCUMENT)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['IMAGE', 'DOCUMENT', 'FIRMWARE'], default: 'DOCUMENT' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Activo almacenado con su registro (tamaño, sha256, tipo real)' })
  @ApiResponse({ status: 400, description: 'Tipo real no coincidente, tamaño excedido o FIRMWARE (alcance diferido: insumo externo, diseño :267)' })
  @ApiResponse({ status: 403, description: 'Sin products:write o ACL insuficiente' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  uploadAsset(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Body('kind') kind?: string,
  ) {
    const wanted = (kind ?? 'DOCUMENT').toUpperCase();
    if (wanted !== 'IMAGE' && wanted !== 'DOCUMENT' && wanted !== 'FIRMWARE') {
      throw new BadRequestException('kind debe ser IMAGE, DOCUMENT o FIRMWARE');
    }
    return this.productsService.uploadAsset(id, wanted as 'IMAGE' | 'DOCUMENT' | 'FIRMWARE', file, this.ctx(user));
  }

  @Delete('images/:imageId')
  @RequireGrant('products:write')
  @ApiOperation({ summary: 'Eliminar imagen de producto' })
  @ApiResponse({ status: 200, description: 'Imagen eliminada' })
  @ApiResponse({ status: 404, description: 'Imagen no encontrada' })
  removeImage(@Param('imageId') imageId: string, @CurrentUser() user: any) {
    return this.productsService.deleteImage(imageId, this.ctx(user));
  }

  @Patch('images/:imageId')
  @RequireGrant('products:write')
  @ApiOperation({ summary: 'Actualizar imagen de producto (alt, tipo y/o principal)' })
  @ApiResponse({ status: 200, description: 'Imagen actualizada' })
  @ApiResponse({ status: 404, description: 'Imagen no encontrada' })
  updateImage(
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.updateImage(imageId, dto, this.ctx(user));
  }

  @Post(':id/publication/schedule')
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Programar publicaciÃ³n de un producto' })
  @ApiResponse({ status: 200, description: 'ProgramaciÃ³n registrada', type: Object })
  @ApiResponse({ status: 403, description: 'Se requiere permiso global publish:manage' })
  @ApiResponse({ status: 409, description: 'CÃ³digo LISTA_PENDIENTE_ELIMINACION' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  schedulePublication(
    @Param('id') id: string,
    @Body() dto: SchedulePublicationDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.schedulePublication(id, dto, this.ctx(user));
  }

  @Post(':id/publication/cancel')
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Cancelar programaciÃ³n de publicaciÃ³n de un producto' })
  @ApiResponse({ status: 200, description: 'ProgramaciÃ³n cancelada', type: Object })
  @ApiResponse({ status: 403, description: 'Se requiere permiso global publish:manage' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  cancelScheduledPublication(
    @Param('id') id: string,
    @Body() _dto: Record<string, never>,
    @CurrentUser() user: any,
  ) {
    return this.productsService.cancelScheduledPublication(id, this.ctx(user));
  }

  @Post("publication/schedule-bulk")
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Programar publicaci\u00f3n masiva de productos' })
  @ApiResponse({ status: 200, description: "Resultado consolidado", type: Object })
  schedulePublicationBulk(
    @Body() dto: BulkSchedulePublicationDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.schedulePublicationBulk(dto.ids, dto, this.ctx(user));
  }

  @Post("publication/cancel-bulk")
  @RequireGrant('products:publish')
  @ApiOperation({ summary: 'Cancelar programaci\u00f3n masiva de publicaci\u00f3n' })
  @ApiResponse({ status: 200, description: "Resultado consolidado", type: Object })
  cancelPublicationBulk(
    @Body() dto: BulkSchedulePublicationDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.cancelPublicationBulk(dto.ids, this.ctx(user));
  }

}
@ApiTags('Listas')
@ApiBearerAuth()
@Controller('api/listas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ListasPublicationController {
  constructor(private readonly productsService: ProductsService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user.id, roles: user?.roles ?? [], userName: user?.name ?? null };
  }

  @Post(':id/publication/publish')
  @Permissions('listas:publish')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar todos los productos elegibles de una Lista' })
  @ApiResponse({ status: 200, description: 'Resultado consolidado', type: Object })
  publishLista(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.publishListaProducts(id, this.ctx(user));
  }

  @Post(':id/publication/schedule')
  @Permissions('listas:publish')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Programar publicacion de una Lista completa' })
  @ApiResponse({ status: 200, description: 'Resultado consolidado', type: Object })
  scheduleLista(@Param('id') id: string, @Body() dto: SchedulePublicationDto, @CurrentUser() user: any) {
    return this.productsService.scheduleListaProducts(id, dto, this.ctx(user));
  }

  @Post(':id/publication/cancel')
  @Permissions('listas:publish')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar programaciones pendientes de una Lista' })
  @ApiResponse({ status: 200, description: 'Resultado consolidado', type: Object })
  cancelLista(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.cancelListaSchedules(id, this.ctx(user));
  }
}
