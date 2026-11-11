import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Pestaña "Tarifas" del panel de clientes (feedback 2026-11-11):
 * `PATCH /:id/tariff`. Ajusta la tarifa por defecto del cliente sin tocar los
 * campos de la edición general (COM-02 §3 sigue vigente: ownerId/status/isActive
 * no se mueven aquí). `priceListId = null` ⇒ vuelve a la tarifa general.
 */
export class UpdateCustomerTariffDto {
  @ApiProperty({
    nullable: true,
    description: 'Lista de precios por defecto del cliente; null = tarifa general',
  })
  @IsUUID(undefined, { message: 'priceListId debe ser un UUID o null' })
  @IsOptional()
  priceListId?: string | null;
}
