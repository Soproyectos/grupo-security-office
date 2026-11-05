import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ALL_ROLES } from '../../common/rbac/roles.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowMastersWrite, RolesOrMastersWriteGuard } from '../masters/masters-write';
import { RequireGrant } from '../../common/security/require-grant';

type ActorRequest = { user?: { sub?: string; name?: string } };
const actorFrom = (req: ActorRequest) => ({ id: req.user?.sub, name: req.user?.name });

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('api/brands')
@UseGuards(JwtAuthGuard, RolesOrMastersWriteGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar marcas' })
  findAll() {
    return this.brandsService.findAll();
  }

  @Get(':id/usage')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Uso y dependencias de la marca y si se puede eliminar' })
  usage(@Param('id') id: string) {
    return this.brandsService.usage(id);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Obtener marca por ID' })
  findOne(@Param('id') id: string) {
    return this.brandsService.findOne(id);
  }

  @Post()
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Crear marca' })
  @ApiResponse({ status: 201, description: 'Marca creada' })
  create(@Body() dto: CreateBrandDto, @Req() req: ActorRequest) {
    return this.brandsService.create(dto, actorFrom(req));
  }

  @Put(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Actualizar marca' })
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto, @Req() req: ActorRequest) {
    return this.brandsService.update(id, dto, actorFrom(req));
  }

  @Patch(':id/toggle-active')
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Alternar estado activo de la marca' })
  @ApiResponse({ status: 200, description: 'Marca actualizada' })
  toggleActive(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.brandsService.toggleActive(id, actorFrom(req));
  }

  @Post(':id/logo')
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir logo de la marca' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Logo subido y marca actualizada' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o excede 8MB' })
  @ApiResponse({ status: 404, description: 'Marca no encontrada' })
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: ActorRequest) {
    return this.brandsService.uploadLogo(id, file, actorFrom(req));
  }

  @Delete(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @AllowMastersWrite()
  @ApiOperation({ summary: 'Eliminar marca' })
  remove(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.brandsService.remove(id, actorFrom(req));
  }
}
