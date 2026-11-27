import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccessContext } from '../../common/acl/acl.service';

@ApiTags('Assignments')
@ApiBearerAuth()
@Controller('api/assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
  }

  @Get()
  @ApiOperation({ summary: 'Listar asignaciones (filtros: userId, resourceType)' })
  findAll(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.assignmentsService.findAll({ userId, resourceType }, this.ctx(user));
  }

  @Get('matrix')
  @ApiOperation({ summary: 'Matriz de accesos por entidad (LISTA|PRODUCT)' })
  @ApiResponse({ status: 200, description: 'Matriz de asignaciones y acciones del viewer' })
  matrix(@CurrentUser() user: any, @Query('entity') entity: string) {
    return this.assignmentsService.matrix(entity, this.ctx(user));
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Vista previa de reglas efectivas de un usuario/rol sobre una entidad (no persiste)',
  })
  preview(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('roleName') roleName?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.assignmentsService.preview({ userId, roleName, entity, entityId }, this.ctx(user));
  }

  @Post()
  @Permissions('assignments:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear o reactivar una asignación' })
  @ApiResponse({ status: 201, description: 'Asignación creada o reactivada' })
  @ApiResponse({ status: 403, description: 'No autorizado para este recurso' })
  @ApiResponse({ status: 404, description: 'Usuario o recurso no existe' })
  @ApiResponse({ status: 409, description: 'Ya existe una asignación activa' })
  create(@CurrentUser() user: any, @Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(dto, this.ctx(user));
  }

  @Patch(':id')
  @Permissions('assignments:manage')
  @ApiOperation({ summary: 'Actualizar level y/o isActive de una asignación' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignmentsService.update(id, dto, this.ctx(user));
  }

  @Delete(':id')
  @Permissions('assignments:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar lógicamente una asignación' })
  @ApiResponse({ status: 204, description: 'Asignación desactivada' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.assignmentsService.remove(id, this.ctx(user));
  }
}
