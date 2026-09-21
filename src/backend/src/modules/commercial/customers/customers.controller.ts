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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AccessContext } from '../../../common/acl/acl.service';

const READ_ROLES = [
  'Super Admin',
  'Supervisor',
  'Admin Comercial',
  'Vendedor',
  'Consulta',
];
const WRITE_ROLES = ['Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor'];

@ApiTags('Commercial - Customers')
@ApiBearerAuth()
@Controller('api/commercial/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'Listar clientes/leads (filtros: search, status, ownerId; paginado)',
  })
  findAll(@CurrentUser() user: any, @Query() query: CustomerQueryDto) {
    return this.customersService.findAll(query, this.ctx(user));
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Detalle de un cliente/lead' })
  @ApiResponse({ status: 404, description: 'No existe o fuera del scope del usuario' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.findOne(id, this.ctx(user));
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cliente/lead (ownerId por defecto = creador)' })
  @ApiResponse({ status: 409, description: 'Documento duplicado' })
  create(@CurrentUser() user: any, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto, this.ctx(user));
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Actualizar un cliente/lead' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto, this.ctx(user));
  }

  @Patch(':id/convert')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Convertir manualmente LEAD → CLIENTE (setea convertedAt)' })
  @ApiResponse({ status: 409, description: 'El registro no está en status LEAD' })
  convert(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.convert(id, this.ctx(user));
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar (soft delete, isActive = false)' })
  @ApiResponse({ status: 204, description: 'Cliente desactivado' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.customersService.remove(id, this.ctx(user));
  }
}
