import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordGapDto {
  @IsString() @MaxLength(120) gapKey!: string;
  @IsIn(['NO_ENCONTRADO', 'NO_PUBLICADO', 'NO_APLICA', 'PENDIENTE']) status!: string;
  @IsIn(['BLOQUEA', 'AVISO']) severity!: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsString() expectedOpenId!: string | null;
}

export class RecordEvidenceDto {
  @IsString() @MaxLength(120) fieldKey!: string;
  @IsIn(['VERIFICADO', 'DECLARADO', 'INFERIDO', 'CONTRADICTORIO']) level!: string;
  @IsIn(['FABRICANTE', 'LISTA_PROVEEDOR', 'MANUAL', 'SCRIPT']) sourceKind!: string;
  @IsOptional() @IsString() @MaxLength(2000) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsString() @MaxLength(128) valueHash?: string;
  @IsOptional() @IsString() expectedId!: string | null;
}
