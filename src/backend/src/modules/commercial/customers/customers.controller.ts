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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService, CustomersAccessContext } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ReassignCustomerDto } from './dto/reassign-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@ApiTags('Commercial - Customers')
@ApiBearerAuth()
@Controller('api/commercial/customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private ctx(user: any): CustomersAccessContext {
    // `jti` alimenta la identidad de `resolveAccess` (customers:edit /
    // customers:reassign); la sesión ya fue validada por JwtStrategy.
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], jti: user?.jti };
  }

  @Get()
  @ApiOperation({
    summary: 'Listar clientes/leads (filtros: search, status, ownerId; paginado)',
  })
  findAll(@CurrentUser() user: any, @Query() query: CustomerQueryDto) {
    return this.customersService.findAll(query, this.ctx(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un cliente/lead' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.findOne(id, this.ctx(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cliente/lead (ownerId por defecto = creador)' })
  @ApiResponse({ status: 409, description: 'Documento duplicado' })
  create(@CurrentUser() user: any, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto, this.ctx(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un cliente/lead' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto, this.ctx(user));
  }

  @Patch(':id/convert')
  @ApiOperation({ summary: 'Convertir manualmente LEAD → CLIENTE (setea convertedAt)' })
  @ApiResponse({ status: 409, description: 'El registro no está en status LEAD' })
  convert(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.convert(id, this.ctx(user));
  }

  @Patch(':id/reassign')
  @ApiOperation({
    summary:
      'Reasignar responsable del cliente (requiere customers:reassign con alcance team/global)',
  })
  @ApiResponse({ status: 403, description: 'Sin customers:reassign que cubra el cliente' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  reassign(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReassignCustomerDto,
  ) {
    return this.customersService.reassign(id, dto, this.ctx(user));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar (soft delete, isActive = false)' })
  @ApiResponse({ status: 204, description: 'Cliente desactivado' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.customersService.remove(id, this.ctx(user));
  }
}
