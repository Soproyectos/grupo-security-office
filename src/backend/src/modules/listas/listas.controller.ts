import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ListasService } from './listas.service';
import { CreateListaDto } from './dto/create-lista.dto';
import { UpdateListaDto } from './dto/update-lista.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessContext } from '../../common/acl/acl.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AclService } from '../../common/acl/acl.service';

@ApiTags('Listas')
@ApiBearerAuth()
@Controller('api/listas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ListasController {
  constructor(private readonly listasService: ListasService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Listar Listas autorizadas (deny-by-default)' })
  findAll(@CurrentUser() user: any, @Query('isActive') isActive?: string) {
    return this.listasService.findAll(this.ctx(user), {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Get(':id')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Obtener una Lista por ID' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.findOne(id, this.ctx(user));
  }

  @Get(':id/products')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Productos de una Lista (scope ACL)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  findProducts(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.listasService.findProducts(id, this.ctx(user), { search, categoryId });
  }

  @Get(':id/prices')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Precios de productos de una Lista (scope ACL)' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  findPrices(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.findPrices(id, this.ctx(user));
  }

  @Get(':id/prices/expiring')
  @Roles('Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta')
  @ApiOperation({ summary: 'Precios próximos a vencer de una Lista (scope ACL)' })
  @ApiQuery({ name: 'days', required: false, description: 'Ventana en días (default 30)' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  findExpiringPrices(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.listasService.findExpiringPrices(
      id,
      this.ctx(user),
      Number.isFinite(parsed) && parsed > 0 ? parsed : 30,
    );
  }

  @Get(':id/assignments')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Accesos (assignments LISTA) de una Lista' })
  findAssignments(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.findAssignments(id, this.ctx(user));
  }

  @Get(':id/audit')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Auditoría de una Lista' })
  findAudit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.findAudit(id, this.ctx(user));
  }

  @Post()
  @Permissions('listas:create')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear Lista' })
  @ApiResponse({ status: 201, description: 'Lista creada' })
  @ApiResponse({ status: 403, description: 'Sin permiso para crear Listas' })
  @ApiResponse({ status: 409, description: 'Código duplicado' })
  create(@Body() dto: CreateListaDto, @CurrentUser() user: any) {
    return this.listasService.create(dto, this.ctx(user));
  }

  @Post(':id/duplicate')
  @Permissions('listas:duplicate')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicar Lista (copia de configuración; nace inactiva)' })
  @ApiResponse({ status: 201, description: 'Lista duplicada (isActive false)' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin acceso edit+ sobre la Lista' })
  duplicate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.duplicateLista(id, this.ctx(user));
  }

  @Patch(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Editar Lista (edit+) / archivar (manage)' })
  update(@Param('id') id: string, @Body() dto: UpdateListaDto, @CurrentUser() user: any) {
    return this.listasService.update(id, dto, this.ctx(user));
  }

  @Patch(':id/toggle-active')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Activar / desactivar Lista (edit+)' })
  toggleActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.toggleActive(id, this.ctx(user));
  }

  @Patch(':id/archive')
  @Permissions('listas:archive')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Archivar Lista lógicamente (manage)' })
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.archive(id, this.ctx(user));
  }

  @Patch(':id/restore')
  @Permissions('listas:archive')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Restaurar Lista archivada (manage)' })
  restore(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listasService.restore(id, this.ctx(user));
  }

  @Post(':id/deletion-request')
  @Permissions('listas:delete')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Solicitar eliminación diferida de Lista (90 días)' })
  @ApiResponse({ status: 200, description: 'Solicitud de eliminación registrada' })
  @ApiResponse({ status: 403, description: 'Sin permiso global listas:delete' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada o archivada' })
  @ApiResponse({ status: 409, description: 'Lista ya pendiente de eliminación' })
  deletionRequest(
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @CurrentUser() user: any,
  ) {
    const ctx = this.ctx(user);
    return this.listasService.deletionRequest(id, dto.reason, ctx);
  }

  @Delete(':id')
  @Permissions('listas:delete')
  @Roles('Super Admin', 'Admin Comercial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Eliminar Lista físicamente (y sus datos asociados en cascada)'
  })
  @ApiResponse({ status: 200, description: 'Lista eliminada' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  
  
remove(@Param('id') id: string, @CurrentUser() user: any) {
  console.log(`[DELETE] Eliminando lista con ID: ${id}`);
  return this.listasService.removeLista(id, this.ctx(user));
}
}
