import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';
import {
  IsDateString,
  IsOptional,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Valida que el campo NO venga en la petición (ni siquiera como `null`).
 * class-validator 0.14 no expone `IsUndefined`; el registro cubre el caso que
 * el contrato marca con «prohibido»: presente ⇒ 400, ausente ⇒ OK.
 */
function IsAbsent(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAbsent',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => value === undefined,
      },
    });
  };
}

/**
 * Edición GENERAL de contacto/notas (COM-02 §3): NO concede `ownerId` ni
 * `status`. La reasignación de cartera vive en el endpoint dedicado
 * `PATCH /:id/reassign` (ReassignCustomerDto, exige `customers:reassign`) y el
 * estado en `PATCH /:id/convert` o soft delete.
 *
 * Los campos prohibidos se declaran SOLO para rechazo explícito: su presencia
 * invalida la petición ENTERA con el código del contrato (§5.1 «sin cambio
 * parcial») — el ValidationPipe global (whitelist + forbidNonWhitelisted de
 * main.ts) devuelve el mismo 400 antes de llegar al servicio.
 */
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['status', 'ownerId'] as const),
) {
  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Prohibido en la edición general (400 owner-not-allowed-in-general-edit). Use PATCH /:id/reassign.',
  })
  @IsAbsent({
    message:
      'owner-not-allowed-in-general-edit: use PATCH /:id/reassign (customers:reassign)',
  })
  ownerId?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Prohibido en la edición general (400 status-not-allowed-in-general-edit). Use PATCH /:id/convert o DELETE.',
  })
  @IsAbsent({
    message:
      'status-not-allowed-in-general-edit: use PATCH /:id/convert o DELETE (soft delete)',
  })
  status?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Prohibido en la edición general (400 isActive-not-allowed-in-general-edit).',
  })
  @IsAbsent({ message: 'isActive-not-allowed-in-general-edit' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Último contacto comercial (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  lastContactAt?: string;
}
