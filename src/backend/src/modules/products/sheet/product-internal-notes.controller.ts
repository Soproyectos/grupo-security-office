import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireGrant } from '../../../common/security/require-grant';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AccessContext } from '../../../common/acl/acl.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreateInternalNoteDto, UpdateInternalNoteDto } from './dto/internal-note.dto';
import { ProductInternalNotesService } from './product-internal-notes.service';

/**
 * Internal notes of a product (a list of notes, each with its author). Authorized only by
 * panel grants: `products:write` AND `products:notes`. No job role grants anything, and editing a
 * note additionally requires being its author (checked in the service).
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/products/:id/internal-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductInternalNotesController {
  constructor(private readonly notes: ProductInternalNotesService) {}

  private ctx(user: any): AccessContext {
    return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], userName: user?.name ?? undefined };
  }

  @Get()
  @RequireGrant('products:write', 'products:notes')
  @ApiOperation({ summary: 'Listar las notas internas de un producto (la más reciente primero)' })
  @ApiResponse({ status: 403, description: 'Sin products:write y products:notes' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  list(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notes.list(id, this.ctx(user));
  }

  @Post()
  @RequireGrant('products:write', 'products:notes')
  @ApiOperation({ summary: 'Escribir una nota interna', description: 'La nota queda a nombre de quien la escribe y se audita.' })
  @ApiResponse({ status: 400, description: 'Texto vacío o demasiado largo' })
  @ApiResponse({ status: 403, description: 'Sin products:write y products:notes' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  create(@Param('id') id: string, @Body() dto: CreateInternalNoteDto, @CurrentUser() user: any) {
    return this.notes.create(id, dto.text, this.ctx(user));
  }

  @Patch(':noteId')
  @RequireGrant('products:write', 'products:notes')
  @ApiOperation({ summary: 'Editar una nota interna', description: 'Solo su autor puede editarla (ni siquiera un administrador).' })
  @ApiResponse({ status: 400, description: 'Texto vacío o demasiado largo' })
  @ApiResponse({ status: 403, description: 'Sin permisos o la nota es de otra persona' })
  @ApiResponse({ status: 404, description: 'Producto o nota no encontrados' })
  @ApiResponse({ status: 409, description: 'La nota cambió desde que se leyó (expectedVersion)' })
  update(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateInternalNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.notes.update(id, noteId, dto.text, dto.expectedVersion, this.ctx(user));
  }
}
