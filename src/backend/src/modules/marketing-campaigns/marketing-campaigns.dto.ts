import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  CAMPAIGN_FITS,
  CAMPAIGN_KINDS,
  MAX_ALT_LENGTH,
  MAX_LINK_LENGTH,
  MAX_NAME_LENGTH,
  type CampaignFit,
  type CampaignKind,
} from './marketing-campaigns.rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Fields shared by create and edit. The link is validated deeply by the service (`normalizeLinkUrl`). */
class CampaignFieldsDto {
  @ApiPropertyOptional({ description: 'Texto alternativo de la imagen (obligatorio para publicar).' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(MAX_ALT_LENGTH)
  alt?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Ruta interna (/catalogo) o URL https. null o vacío = sin enlace.' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(MAX_LINK_LENGTH)
  linkUrl?: string | null;

  @ApiPropertyOptional({ description: 'Orden dentro de los banners del título (menor primero).' })
  @IsOptional() @IsInt() @Min(0) @Max(999)
  position?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Inicio de vigencia (ISO 8601 con zona horaria).' })
  @IsOptional() @IsISO8601({ strict: true }) @Transform(({ value }) => (value === '' ? null : value))
  startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Fin de vigencia (ISO 8601 con zona horaria).' })
  @IsOptional() @IsISO8601({ strict: true }) @Transform(({ value }) => (value === '' ? null : value))
  endsAt?: string | null;

  @ApiPropertyOptional({ enum: CAMPAIGN_FITS })
  @IsOptional() @IsIn([...CAMPAIGN_FITS])
  fit?: CampaignFit;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  focusX?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  focusY?: number;

  @ApiPropertyOptional({ enum: CAMPAIGN_FITS, description: 'Ajuste de la imagen de móvil; si falta, usa el de escritorio.' })
  @IsOptional() @IsIn([...CAMPAIGN_FITS])
  fitMobile?: CampaignFit;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Foco horizontal de la imagen de móvil; si falta, usa el de escritorio.' })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  focusMobileX?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Foco vertical de la imagen de móvil; si falta, usa el de escritorio.' })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  focusMobileY?: number;
}

export class CreateCampaignDto extends CampaignFieldsDto {
  @ApiProperty({ enum: CAMPAIGN_KINDS })
  @IsIn([...CAMPAIGN_KINDS])
  kind!: CampaignKind;

  @ApiProperty({ description: 'Nombre interno (no se muestra en la tienda).' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(MAX_NAME_LENGTH)
  name!: string;
}

export class UpdateCampaignDto extends CampaignFieldsDto {
  @ApiProperty({ description: 'Revisión que la persona tenía al abrir la campaña; si cambió, responde 409.' })
  @IsInt() @Min(0)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(MAX_NAME_LENGTH)
  name?: string;
}

export class PublishCampaignDto {
  @ApiPropertyOptional({ description: 'Revisión del borrador que se quiere publicar; si cambió, responde 409.' })
  @IsOptional() @IsInt() @Min(0)
  revision?: number;
}
