import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AccessContext } from '../../../common/acl/acl.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UpdateProductSheetDto } from './dto/product-sheet.dto';
import { ProductSheetService } from './product-sheet.service';

/**
 * Admin editor of the public product sheet. Same authorization as editing a
 * product (`PUT /api/products/:id`): Super Admin / Admin Comercial plus the
 * `edit_products` ACL level on the product's Lista.
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/products/:id/sheet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductSheetController {
  constructor(private readonly sheets: ProductSheetService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({ summary: 'Leer la ficha pública editable de un producto' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.sheets.get(id, this.ctx(user));
  }

  @Put()
  @Roles('Super Admin', 'Admin Comercial')
  @ApiOperation({
    summary: 'Reemplazar la ficha pública de un producto',
    description:
      'Reemplaza datos de ficha, grupos de especificaciones y documentos/firmware en una sola transacción. Audita el cambio.',
  })
  @ApiResponse({ status: 400, description: 'Validación fallida' })
  @ApiResponse({ status: 403, description: 'Rol sin permiso o ACL insuficiente' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({ status: 409, description: 'Slug ya usado por otro producto' })
  update(@Param('id') id: string, @Body() dto: UpdateProductSheetDto, @CurrentUser() user: any) {
    return this.sheets.update(id, dto, this.ctx(user));
  }
}
