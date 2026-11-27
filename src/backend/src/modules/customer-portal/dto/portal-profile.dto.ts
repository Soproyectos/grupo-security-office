import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdatePortalProfileDto {
  @Transform(trim) @IsString({ message: 'Indica el nombre de tu empresa' }) @Length(2, 160, { message: 'El nombre de la empresa debe tener entre 2 y 160 caracteres' })
  companyName!: string;

  @IsOptional() @Transform(trim) @IsString() @Length(3, 40, { message: 'El documento debe tener entre 3 y 40 caracteres' })
  documentId?: string;

  @IsOptional() @Transform(trim) @IsString() @Length(7, 30, { message: 'El teléfono debe tener entre 7 y 30 caracteres' })
  phone?: string;

  /** DIVIPOLA municipality code; the service checks it against the fixed catalog. */
  @IsOptional() @Transform(trim) @IsString({ message: 'Elige tu ciudad de la lista' }) @Length(5, 5, { message: 'Elige tu ciudad de la lista' })
  city?: string;

  @IsOptional() @IsBoolean({ message: 'Valor inválido para la política de datos' })
  acceptPrivacy?: boolean;
}

export class SuspendPortalAccountDto {
  @Transform(trim) @IsString({ message: 'Indica el motivo' }) @Length(3, 300, { message: 'El motivo debe tener entre 3 y 300 caracteres' })
  reason!: string;
}
