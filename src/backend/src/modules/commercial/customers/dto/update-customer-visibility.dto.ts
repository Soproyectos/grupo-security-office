import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pestaña "Visibilidad" del panel de clientes (feedback 2026-11-11):
 * `PATCH /:id/visibility`. Configura qué puede ver el cliente en su portal.
 * Se guardan como JSON en `Customer.visibleFields`; el portal los lee al
 * construir su navegación. Los flags son explícitos y completos: la petición
 * reemplaza la configuración anterior (semántica PUT sobre el recurso).
 */
export class CustomerVisibleFieldsDto {
  @ApiProperty({ description: 'Ver catálogo de productos' })
  @IsBoolean()
  catalog: boolean;

  @ApiProperty({ description: 'Ver precios (de su tarifa)' })
  @IsBoolean()
  prices: boolean;

  @ApiProperty({ description: 'Ver sus cotizaciones' })
  @IsBoolean()
  quotes: boolean;

  @ApiProperty({ description: 'Ver sus órdenes de compra/venta' })
  @IsBoolean()
  orders: boolean;
}

export class UpdateCustomerVisibilityDto {
  @ApiProperty({ type: CustomerVisibleFieldsDto })
  @ValidateNested()
  @Type(() => CustomerVisibleFieldsDto)
  visibleFields: CustomerVisibleFieldsDto;
}
