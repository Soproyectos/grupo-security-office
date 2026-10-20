import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Reasignación de cartera — DTO del endpoint DEDICADO `PATCH /:id/reassign`
 * (COM-02 §3): «cambiar de responsable no puede enviarse bajo una edición de
 * contacto sin `customers:reassign`» (DISENO:188). El servicio exige la
 * concesión `customers:reassign` (catálogo: scopes team|global, depende de
 * `customers:read`) resuelta con `resolveAccess` sobre el recurso.
 *
 * F6 (pendiente del coordinador): NO se admite «sin responsable» — `ownerId`
 * es requerido; el `disconnect` que permitía el PATCH general se retira con
 * ese contrato.
 */
export class ReassignCustomerDto {
  @ApiProperty({ description: 'Nuevo responsable (userId)' })
  @IsUUID()
  ownerId: string;

  @ApiPropertyOptional({ description: 'Motivo del cambio de responsable (queda en la auditoría)' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  motivo?: string;
}
