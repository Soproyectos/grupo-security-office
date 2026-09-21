import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ALL_ROLES } from '../../common/rbac/roles.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('api/brands')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar marcas' })
  findAll() {
    return this.brandsService.findAll();
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Obtener marca por ID' })
  findOne(@Param('id') id: string) {
    return this.brandsService.findOne(id);
  }

  @Post()
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Crear marca' })
  @ApiResponse({ status: 201, description: 'Marca creada' })
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Put(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Actualizar marca' })
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Alternar estado activo de la marca' })
  @ApiResponse({ status: 200, description: 'Marca actualizada' })
  toggleActive(@Param('id') id: string) {
    return this.brandsService.toggleActive(id);
  }

  @Post(':id/logo')
  @Roles('Super Admin', 'Admin Comercial')
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
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.brandsService.uploadLogo(id, file);
  }

  @Delete(':id')
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Eliminar marca' })
  remove(@Param('id') id: string) {
    return this.brandsService.remove(id);
  }
}
