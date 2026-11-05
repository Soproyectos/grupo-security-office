import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ALL_ROLES } from '../../common/rbac/roles.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowMastersWrite, RolesOrMastersWriteGuard } from '../masters/masters-write';
import { SetActiveDto } from '../masters/dto/set-active.dto';
import { RequireGrant } from '../../common/security/require-grant';

type ActorRequest = { user?: { sub?: string; name?: string } };

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('api/categories')
@UseGuards(JwtAuthGuard, RolesOrMastersWriteGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar categorías' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get('tree')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Obtener árbol de categorías' })
  findTree() {
    return this.categoriesService.findTree();
  }

  @Get('classification-tree')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Categorías principales con sus subcategorías activas (selector de clasificación)' })
  classificationTree() {
    return this.categoriesService.classificationTree();
  }

  @Get(':id/usage')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Uso y dependencias de la categoría (productos, hijas, subcategorías) y si se puede eliminar' })
  usage(@Param('id') id: string) {
    return this.categoriesService.usage(id);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Obtener categoría por ID' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Crear categoría' })
  @ApiResponse({ status: 201, description: 'Categoría creada' })
  create(@Body() dto: CreateCategoryDto, @Req() req: ActorRequest) {
    return this.categoriesService.create(dto, { id: req.user?.sub, name: req.user?.name });
  }

  @Put(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Actualizar categoría' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @Req() req: ActorRequest) {
    return this.categoriesService.update(id, dto, { id: req.user?.sub, name: req.user?.name });
  }

  @Patch(':id/active')
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Activar o desactivar la categoría (no elimina productos, precios ni historial)' })
  toggleActive(@Param('id') id: string, @Body() body: SetActiveDto, @Req() req: ActorRequest) {
    return this.categoriesService.setActive(id, body.isActive, { id: req.user?.sub, name: req.user?.name });
  }

  @Delete(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Eliminar categoría' })
  remove(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.categoriesService.remove(id, { id: req.user?.sub, name: req.user?.name });
  }
}
