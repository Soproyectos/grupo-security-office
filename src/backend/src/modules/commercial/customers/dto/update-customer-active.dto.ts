import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Activar/desactivar cliente desde la pestaña "Gestión" del panel
 * (feedback 2026-11-11): `PATCH /:id/active`. El toggle vive en un endpoint
 * DEDICADO — igual que reassign/convert — porque COM-2 §3 prohíbe `isActive`
 * en el PATCH general. Desactivar es equivalente al soft delete (DELETE);
 * activar revierte esa decisión y también marca `status = CLIENTE` cuando el
 * registro estaba en `INACTIVO`, para que vuelva a la cartera activa.
 */
export class UpdateCustomerActiveDto {
  @ApiProperty({ description: 'true = activo, false = inactivo (soft)' })
  @IsBoolean()
  isActive: boolean;
}
