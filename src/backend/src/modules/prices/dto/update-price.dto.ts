import { IsNumber, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsCopPrice } from '../../../common/money/cop-price.validator';

export class UpdatePriceDto {
  @ApiPropertyOptional({ example: 1600000 })
  @IsNumber()
  @IsCopPrice()
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ example: 'lista-uuid-here', description: 'Debe coincidir con la Lista del producto.' })
  @IsString()
  @IsUUID()
  @IsOptional()
  listaId?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}
