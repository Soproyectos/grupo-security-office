import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateZoneDto {
  @Transform(trim)
  @IsString({ message: 'Indica el nombre de la zona' })
  @Length(2, 80, { message: 'El nombre de la zona debe tener entre 2 y 80 caracteres' })
  name!: string;

  /** DIVIPOLA municipality codes; the service checks each one against the fixed catalog. */
  @IsArray({ message: 'Elige las ciudades de la zona' })
  @ArrayNotEmpty({ message: 'Elige al menos una ciudad' })
  @ArrayMaxSize(1200, { message: 'La zona tiene demasiadas ciudades' })
  @IsString({ each: true, message: 'Hay una ciudad que no es válida' })
  @Length(5, 5, { each: true, message: 'Hay una ciudad que no es válida' })
  cityCodes!: string[];
}

export class UpdateZoneDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Indica el nombre de la zona' })
  @Length(2, 80, { message: 'El nombre de la zona debe tener entre 2 y 80 caracteres' })
  name?: string;

  @IsOptional()
  @IsBoolean({ message: 'Indica si la zona está activa' })
  isActive?: boolean;

  /** Replaces the whole set of cities of the zone. */
  @IsOptional()
  @IsArray({ message: 'Elige las ciudades de la zona' })
  @ArrayNotEmpty({ message: 'Elige al menos una ciudad' })
  @ArrayMaxSize(1200, { message: 'La zona tiene demasiadas ciudades' })
  @IsString({ each: true, message: 'Hay una ciudad que no es válida' })
  @Length(5, 5, { each: true, message: 'Hay una ciudad que no es válida' })
  cityCodes?: string[];
}
