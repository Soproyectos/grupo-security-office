import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Icon keys the public sheet knows how to render (see frontend `icons.tsx`). */
export const SHEET_FEATURE_ICONS = ['shield', 'chip', 'video', 'person', 'audio', 'cloud', 'storage'] as const;
export type SheetFeatureIcon = (typeof SHEET_FEATURE_ICONS)[number];

export const SHEET_STATUSES = ['ACTIVE', 'DISCONTINUED'] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export const SHEET_RESOURCE_KINDS = [
  'DATASHEET',
  'MANUAL',
  'QUICK_GUIDE',
  'CERTIFICATE',
  'OTHER_DOCUMENT',
  'FIRMWARE',
  'RELEASE_NOTES',
] as const;
export type SheetResourceKind = (typeof SHEET_RESOURCE_KINDS)[number];

/** Public catalog slug: lowercase letters, digits and dashes, starting with a letter or digit. */
export const SHEET_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,127}$/;
/** Absolute http(s) URL, or a relative path under `/api/` (files stored by this backend). */
export const SHEET_URL_REGEX = /^(https?:\/\/[^\s/$.?#][^\s]*|\/api\/[^\s]*)$/i;
const LANGUAGE_REGEX = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class SheetFeatureDto {
  @ApiPropertyOptional({ description: 'Stable id (kebab-case). Generated from the label when omitted.' })
  @IsOptional()
  @Matches(KEY_REGEX, { message: 'id de característica inválido' })
  id?: string;

  @ApiProperty({ example: 'AcuSense' })
  @IsString()
  @IsNotEmpty({ message: 'Cada característica necesita un texto' })
  @MaxLength(80)
  label: string;

  @ApiProperty({ enum: SHEET_FEATURE_ICONS })
  @IsIn(SHEET_FEATURE_ICONS as unknown as string[], { message: 'Ícono no permitido' })
  icon: SheetFeatureIcon;
}

export class SheetSpecItemDto {
  @ApiProperty({ example: 'Canales de video' })
  @IsString()
  @IsNotEmpty({ message: 'Cada especificación necesita un nombre' })
  @MaxLength(200)
  label: string;

  @ApiProperty({ example: '4 canales' })
  @IsString()
  @IsNotEmpty({ message: 'Cada especificación necesita un valor' })
  @MaxLength(2000)
  value: string;
}

export class SheetSpecGroupDto {
  @ApiPropertyOptional({ description: 'Stable anchor key (kebab-case). Generated from the title when omitted.' })
  @IsOptional()
  @Matches(KEY_REGEX, { message: 'key de grupo inválida' })
  key?: string;

  @ApiProperty({ example: 'Video y audio' })
  @IsString()
  @IsNotEmpty({ message: 'Cada grupo necesita un título' })
  @MaxLength(120)
  title: string;

  @ApiProperty({ type: [SheetSpecItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SheetSpecItemDto)
  items: SheetSpecItemDto[];
}

export class SheetResourceDto {
  @ApiProperty({ enum: SHEET_RESOURCE_KINDS })
  @IsIn(SHEET_RESOURCE_KINDS as unknown as string[], { message: 'Tipo de recurso inválido' })
  kind: SheetResourceKind;

  @ApiProperty({ example: 'Ficha técnica' })
  @IsString()
  @IsNotEmpty({ message: 'Cada documento necesita un título' })
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'es' })
  @IsString()
  @Matches(LANGUAGE_REGEX, { message: 'Idioma inválido (ej. es, en)' })
  language: string;

  @ApiProperty({ description: 'http(s) URL or a relative /api/... path' })
  @IsString()
  @MaxLength(2048)
  @Matches(SHEET_URL_REGEX, { message: 'La URL debe ser http(s) o una ruta /api/...' })
  url: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  version?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string | null;

  @ApiProperty()
  @IsBoolean()
  requiresLicense: boolean;
}

/**
 * Full editable sheet of a product (PUT replaces it as a whole). The same shape is
 * returned by GET. `catalog*` columns are exposed without the prefix.
 */
export class UpdateProductSheetDto {
  @ApiPropertyOptional({ nullable: true, description: 'Sheet title; falls back to the product name when empty.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Public slug (unique): /productos/:slug' })
  @IsOptional()
  @IsString()
  @Matches(SHEET_SLUG_REGEX, { message: 'Slug inválido: usa minúsculas, números y guiones' })
  slug?: string | null;

  @ApiProperty({ description: 'Reachable through its slug. Requires a slug.' })
  @IsBoolean()
  published: boolean;

  @ApiProperty({ enum: SHEET_STATUSES })
  @IsIn(SHEET_STATUSES as unknown as string[], { message: 'Estado inválido' })
  status: SheetStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  badges: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  highlights: string[];

  @ApiProperty({ type: [SheetFeatureDto] })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => SheetFeatureDto)
  features: SheetFeatureDto[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  availableModels: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(SHEET_URL_REGEX, { message: 'La URL de imagen debe ser http(s) o una ruta /api/...' })
  imageUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageAlt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specsDisclaimer?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  firmwareNote?: string | null;

  @ApiProperty({ type: [SheetSpecGroupDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SheetSpecGroupDto)
  specGroups: SheetSpecGroupDto[];

  @ApiProperty({ type: [SheetResourceDto], description: 'Documents and firmware, in display order.' })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => SheetResourceDto)
  resources: SheetResourceDto[];
}

/** Read model: the editable sheet plus read-only product context. */
export interface ProductSheetView extends Required<Omit<UpdateProductSheetDto, 'features' | 'specGroups' | 'resources'>> {
  productId: string;
  sku: string;
  productName: string;
  features: { id: string; label: string; icon: SheetFeatureIcon }[];
  specGroups: { key: string; title: string; items: { label: string; value: string }[] }[];
  resources: {
    kind: SheetResourceKind;
    title: string;
    language: string;
    url: string;
    fileName: string | null;
    version: string | null;
    region: string | null;
    requiresLicense: boolean;
  }[];
  updatedAt: Date;
}
