import { IsString, IsNumber, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCopPrice } from '../../../common/money/cop-price.validator';

export class CreatePriceDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 'pricelist-uuid' })
  @IsString()
  priceListId: string;

  @ApiProperty({ example: 1500000 })
  @IsNumber()
  @IsCopPrice()
  value: number;

  @ApiPropertyOptional({ example: 'lista-uuid-here', description: 'Lista a la que pertenece el precio (debe coincidir con la Lista del producto).' })
  @IsString()
  @IsUUID()
  @IsOptional()
  listaId?: string;

  @ApiPropertyOptional({ example: 'COP' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}
