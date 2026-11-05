import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export const SPEC_DATA_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'OPTION', 'MULTI_OPTION'] as const
export const SPEC_VALUE_STATES = ['KNOWN', 'NOT_APPLICABLE', 'UNKNOWN'] as const
export const WRITABLE_TEMPLATE_STATUSES = ['PROPOSED', 'APPROVED', 'RETIRED'] as const

// ---------------------------------------------------------------- dictionary

export class SpecOptionInputDto {
  @ApiProperty() @IsString() @MaxLength(64) key: string
  @ApiProperty() @IsString() @MaxLength(120) label: string
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean
}

export class CreateSpecDefinitionDto {
  @ApiProperty({ description: 'Stable key, lowercase snake_case.' }) @IsString() @MaxLength(64) key: string
  @ApiProperty() @IsString() @MaxLength(120) label: string
  @ApiProperty({ enum: SPEC_DATA_TYPES }) @IsIn([...SPEC_DATA_TYPES]) dataType: (typeof SPEC_DATA_TYPES)[number]
  @ApiPropertyOptional({ description: 'Canonical unit of NUMBER data.' }) @IsOptional() @IsString() @MaxLength(32) unit?: string | null
  @ApiPropertyOptional({ type: [SpecOptionInputDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SpecOptionInputDto)
  options?: SpecOptionInputDto[]
}

export class UpdateSpecDefinitionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) label?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) unit?: string | null
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean
  @ApiPropertyOptional({ type: [SpecOptionInputDto], description: 'Upserted by key. Options are never deleted: send isActive=false.' })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SpecOptionInputDto)
  options?: SpecOptionInputDto[]
  @ApiPropertyOptional({ description: 'Confirms relabeling or deactivating options that products already selected.' })
  @IsOptional() @IsBoolean() confirmImpact?: boolean
}

// ------------------------------------------------------------------ template

export class TemplateEntryInputDto {
  @ApiProperty({ description: 'Key of the dictionary datum.' }) @IsString() specKey: string
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean
  @ApiPropertyOptional({ description: 'Written justification; mandatory when isRequired.' }) @IsOptional() @IsString() @MaxLength(1000) requiredReason?: string | null
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFilterable?: boolean
  @ApiPropertyOptional({ enum: WRITABLE_TEMPLATE_STATUSES, description: 'PROPOSED or RETIRED. APPROVED is refused here: use the approve action.' })
  @IsOptional() @IsIn([...WRITABLE_TEMPLATE_STATUSES]) status?: (typeof WRITABLE_TEMPLATE_STATUSES)[number]
}

export class UpdateTemplateDto {
  @ApiProperty({ type: [TemplateEntryInputDto] })
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TemplateEntryInputDto)
  entries: TemplateEntryInputDto[]
}

/** The approver is NOT a field: it is the authenticated user (a body that sends `approvedBy` is rejected). */
export class ApproveTemplateEntryDto {
  @ApiPropertyOptional({ description: 'Reason; stored as the justification when the entry is required and has none.' }) @IsOptional() @IsString() @MaxLength(1000) reason?: string
}

// -------------------------------------------------------------------- values

export class ProductSpecValueEntryDto {
  @ApiProperty() @IsString() specKey: string
  @ApiPropertyOptional() @IsOptional() valueText?: string | null
  @ApiPropertyOptional() @IsOptional() valueNumber?: number | null
  @ApiPropertyOptional() @IsOptional() valueBoolean?: boolean | null
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) optionKeys?: string[] | null
  @ApiPropertyOptional({ description: 'Unit the number was typed in; must equal the dictionary unit.' }) @IsOptional() unit?: string | null
  @ApiPropertyOptional({ description: 'Explicit erase of the working value. A blank entry never erases.' }) @IsOptional() @IsBoolean() clear?: boolean
  @ApiPropertyOptional({
    enum: SPEC_VALUE_STATES,
    description: 'KNOWN (default) carries a value. NOT_APPLICABLE and UNKNOWN carry none and cannot be combined with one.',
  })
  @IsOptional() @IsIn([...SPEC_VALUE_STATES]) state?: (typeof SPEC_VALUE_STATES)[number]
}

export class UpdateProductSpecValuesDto {
  @ApiProperty({ type: [ProductSpecValueEntryDto] })
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ProductSpecValueEntryDto)
  entries: ProductSpecValueEntryDto[]
}

export interface ProductSpecWriteEntry {
  specKey: string
  valueText?: string | null
  valueNumber?: number | null
  valueBoolean?: boolean | null
  optionKeys?: string[] | null
  unit?: string | null
  clear?: boolean
  state?: (typeof SPEC_VALUE_STATES)[number]
}

export interface ProductSpecWriteSource {
  kind: string
  ref?: string
  sheet?: string
  row?: number
}

export interface ProductSpecWriteResult {
  specKey: string
  outcome: 'saved' | 'unchanged' | 'rejected'
  code?: string
  message?: string
}
