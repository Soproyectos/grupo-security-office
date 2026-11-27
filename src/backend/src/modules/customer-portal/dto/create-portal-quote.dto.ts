import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const PORTAL_QUOTE_MAX_PRODUCTS = 100;
export const PORTAL_QUOTE_MAX_QUANTITY = 9999;

export class PortalQuoteItemDto {
  @IsString({ message: 'El producto no es válido' })
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'El producto no es válido' })
  productId!: string;

  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(PORTAL_QUOTE_MAX_QUANTITY, { message: `La cantidad máxima por producto es ${PORTAL_QUOTE_MAX_QUANTITY}` })
  quantity!: number;
}

/** A customer sends the quote they built in the store: products and quantities only; prices come from the company tariff. */
export class CreatePortalQuoteDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Agrega al menos un producto' })
  // Duplicates are merged afterwards; the limit of distinct products is enforced by the service.
  @ArrayMaxSize(PORTAL_QUOTE_MAX_PRODUCTS * 3, { message: 'La cotización tiene demasiadas líneas' })
  @ValidateNested({ each: true })
  @Type(() => PortalQuoteItemDto)
  items!: PortalQuoteItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Las notas pueden tener hasta 1000 caracteres' })
  notes?: string;
}
