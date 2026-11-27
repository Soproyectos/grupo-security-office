import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SetActiveDto } from '../masters/dto/set-active.dto';
import { RequireGrant } from '../../common/security/require-grant';
import { CatalogRead } from '../../common/security/throttle-policy';

type ActorRequest = { user?: { sub?: string; name?: string } };

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('api/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @CatalogRead()
  @Get()
  @ApiOperation({ summary: 'Listar categorías' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @CatalogRead()
  @Get('tree')
  @ApiOperation({ summary: 'Obtener árbol de categorías' })
  findTree() {
    return this.categoriesService.findTree();
  }

  @CatalogRead()
  @Get('classification-tree')
  @ApiOperation({ summary: 'Categorías principales con sus subcategorías activas (selector de clasificación)' })
  classificationTree() {
    return this.categoriesService.classificationTree();
  }

  @CatalogRead()
  @Get(':id/usage')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Uso y dependencias de la categoría (productos, hijas, subcategorías) y si se puede eliminar' })
  usage(@Param('id') id: string) {
    return this.categoriesService.usage(id);
  }

  @CatalogRead()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener categoría por ID' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Crear categoría' })
  @ApiResponse({ status: 201, description: 'Categoría creada' })
  create(@Body() dto: CreateCategoryDto, @Req() req: ActorRequest) {
    return this.categoriesService.create(dto, { id: req.user?.sub, name: req.user?.name });
  }

  @Put(':id')
  @RequireGrant('masters:write')
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
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Eliminar categoría' })
  remove(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.categoriesService.remove(id, { id: req.user?.sub, name: req.user?.name });
  }
}
