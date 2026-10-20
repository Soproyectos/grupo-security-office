import { IsNotEmpty, IsObject, IsOptional, IsInt, Min, IsString, MaxLength } from 'class-validator';

/**
 * CAT-02 backend-borradores — cuerpo de «guardar borrador».
 * `expectedVersion` es la OCC: la última versión que el cliente vio.
 */
export class SaveProductDraftDto {
  @IsObject()
  @IsNotEmpty()
  content: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
