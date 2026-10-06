import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorefrontService } from './storefront.service';
import { UpdateStorefrontContactDto } from './dto/storefront-contact.dto';

@ApiTags('Storefront')
@ApiBearerAuth()
@Controller('api/storefront')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('contact')
  @Permissions('storefront:read')
  @ApiOperation({ summary: 'Obtener los datos de contacto de la tienda' })
  @ApiResponse({ status: 404, description: 'No hay datos de contacto configurados' })
  getContact() {
    return this.storefrontService.getContact();
  }

  /**
   * El singleton no tiene `POST`: siempre existe una fila (la del seed) y se
   * actualiza in situ, así que el `PUT` no puede dejar datos huérfanos ni
   * duplicados.
   */
  @Put('contact')
  @Permissions('storefront:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar los datos de contacto de la tienda' })
  @ApiResponse({ status: 200, description: 'Datos de contacto actualizados' })
  @ApiResponse({ status: 400, description: 'Algún campo no cumple el formato esperado' })
  @ApiResponse({ status: 403, description: 'No autorizado para este recurso' })
  @ApiResponse({ status: 404, description: 'No hay datos de contacto configurados' })
  updateContact(@Body() dto: UpdateStorefrontContactDto, @CurrentUser() user: any) {
    return this.storefrontService.updateContact(dto, user?.sub ?? user?.id);
  }
}