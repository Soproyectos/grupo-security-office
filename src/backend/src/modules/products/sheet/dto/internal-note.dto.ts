import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Maximum length of one internal note (same limit the old single-text field had). */
export const INTERNAL_NOTE_MAX_LENGTH = 4000;

export class CreateInternalNoteDto {
  @ApiProperty({ maxLength: INTERNAL_NOTE_MAX_LENGTH, example: 'Proveedor confirmó stock para noviembre' })
  @IsString({ message: 'La nota debe ser un texto' })
  @MaxLength(INTERNAL_NOTE_MAX_LENGTH, { message: `La nota no puede superar ${INTERNAL_NOTE_MAX_LENGTH} caracteres` })
  text: string;
}

export class UpdateInternalNoteDto extends CreateInternalNoteDto {
  @ApiPropertyOptional({
    description: 'Versión de la nota que la persona vio. Si ya cambió (otra pestaña o sesión) → 409 sin escribir.',
  })
  @IsOptional()
  @IsInt({ message: 'La versión de la nota no es válida' })
  @Min(0, { message: 'La versión de la nota no es válida' })
  expectedVersion?: number;
}

/** One note as the screen shows it. Dates are ISO strings in JSON. */
export interface InternalNoteView {
  id: string;
  text: string;
  authorName: string;
  createdAt: Date;
  /** `null` while the note has never been edited. */
  updatedAt: Date | null;
  /** True only when the current user wrote the note (computed by the server). */
  canEdit: boolean;
  /** Send it back as `expectedVersion` when editing. */
  version: number;
}
