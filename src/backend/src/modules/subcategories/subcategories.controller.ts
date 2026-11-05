import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequireGrant } from '../../common/security/require-grant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SetActiveDto } from '../masters/dto/set-active.dto';
import { CreateSubcategoryDto, ListSubcategoriesQueryDto, UpdateSubcategoryDto } from './dto/subcategory.dto';
import { SubcategoriesService } from './subcategories.service';

type ActorRequest = { user?: { sub?: string; name?: string } };
const actorFrom = (req: ActorRequest) => ({ id: req.user?.sub, name: req.user?.name });

/** Master catalog of subcategories. Authorized only by the panel grants masters:read / masters:write. */
@ApiTags('Subcategories')
@ApiBearerAuth()
@Controller('api/subcategories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubcategoriesController {
  constructor(private readonly subcategories: SubcategoriesService) {}

  @Get()
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Listar y buscar subcategorías (paginado; por categoría y estado)' })
  list(@Query() query: ListSubcategoriesQueryDto) {
    return this.subcategories.list(query);
  }

  @Get(':id/usage')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Uso y dependencias de la subcategoría y si se puede eliminar' })
  usage(@Param('id') id: string) {
    return this.subcategories.usage(id);
  }

  @Get(':id')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Obtener subcategoría por ID' })
  findOne(@Param('id') id: string) {
    return this.subcategories.findOne(id);
  }

  @Post()
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Crear subcategoría' })
  create(@Body() dto: CreateSubcategoryDto, @Req() req: ActorRequest) {
    return this.subcategories.create(dto, actorFrom(req));
  }

  @Put(':id')
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Renombrar o mover la subcategoría (mover con productos exige confirmImpact)' })
  update(@Param('id') id: string, @Body() dto: UpdateSubcategoryDto, @Req() req: ActorRequest) {
    return this.subcategories.update(id, dto, actorFrom(req));
  }

  @Patch(':id/active')
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Activar o desactivar (no elimina productos, precios ni historial)' })
  setActive(@Param('id') id: string, @Body() body: SetActiveDto, @Req() req: ActorRequest) {
    return this.subcategories.setActive(id, body.isActive, actorFrom(req));
  }

  @Delete(':id')
  @RequireGrant('masters:write')
  @ApiOperation({ summary: 'Eliminar la subcategoría solo si no tiene productos ni molde' })
  remove(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.subcategories.remove(id, actorFrom(req));
  }
}
