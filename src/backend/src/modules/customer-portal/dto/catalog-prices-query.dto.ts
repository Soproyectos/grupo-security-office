import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, Matches } from 'class-validator';

export class CatalogPricesQueryDto {
  @Transform(({ value }) => typeof value === 'string' ? value.split(',').map((id: string) => id.trim()) : value)
  @IsArray()
  @ArrayNotEmpty({ message: 'Indica al menos un producto' })
  @ArrayMaxSize(50, { message: 'Puedes consultar hasta 50 productos por solicitud' })
  @IsString({ each: true })
  @Matches(/^[a-zA-Z0-9_-]+$/, { each: true, message: 'La lista de productos no es válida' })
  ids!: string[];
}
