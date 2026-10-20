import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
  ValidateNested,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ACCESS_CATALOG_VERSION,
  isActionIdFormat,
  getActionDefinition,
  type AccessScope,
} from '../../../common/security/access-catalog';

function validateBy(
  name: string,
  validate: (value: unknown, args: ValidationArguments) => boolean,
  defaultMessage: (args: ValidationArguments) => string,
  validationOptions?: ValidationOptions,
) {
  return ValidateBy({ name, validator: { validate, defaultMessage } }, validationOptions);
}

/** Formato `apartado:acción`, presente en catálogo y habilitada. */
export function IsAssignableAction(validationOptions?: ValidationOptions) {
  return validateBy(
    'isAssignableAction',
    (value) => {
      if (typeof value !== 'string' || !isActionIdFormat(value)) return false;
      const definition = getActionDefinition(value);
      return !!definition && definition.enabled;
    },
    (args) => {
      const id = String(args.value);
      if (!isActionIdFormat(id)) {
        return `"${id}" no es un ID de acción válido; se espera el formato apartado:acción (p. ej. customers:read).`;
      }
      const definition = getActionDefinition(id);
      if (!definition) {
        return `La acción "${id}" no existe en el catálogo de acciones.`;
      }
      return `La acción "${id}" está deshabilitada y no puede concederse.`;
    },
    validationOptions,
  );
}

/** El alcance debe estar en `allowedScopes` de la acción (informa los válidos). */
export function IsScopeAllowedForAction(validationOptions?: ValidationOptions) {
  return validateBy(
    'isScopeAllowedForAction',
    (value, args) => {
      const grant = args?.object as AssignAccessGrantDto | undefined;
      const definition = getActionDefinition(grant?.actionId ?? '');
      if (!definition) return true; // el validador de actionId ya informa
      return definition.allowedScopes.includes(value as AccessScope);
    },
    (args) => {
      const grant = args.object as AssignAccessGrantDto | undefined;
      const definition = getActionDefinition(grant?.actionId ?? '');
      return `La acción "${grant?.actionId}" no admite el alcance "${String(args.value)}"; permitidos: ${(definition?.allowedScopes ?? []).join(', ')}.`;
    },
    validationOptions,
  );
}

/** `list`/`product` exigen resourceId; `own`/`team`/`global` lo prohíben. */
export function IsResourceIdConsistentWithScope(validationOptions?: ValidationOptions) {
  return validateBy(
    'isResourceIdConsistentWithScope',
    (value, args) => {
      const grant = args?.object as AssignAccessGrantDto | undefined;
      if (grant?.scope === 'list' || grant?.scope === 'product') {
        return typeof value === 'string' && value.trim() !== '';
      }
      return value === undefined || value === null || value === '';
    },
    (args) => {
      const grant = args.object as AssignAccessGrantDto | undefined;
      if (grant?.scope === 'list' || grant?.scope === 'product') {
        return `El alcance "${grant.scope}" exige un resourceId explícito para "${grant.actionId}".`;
      }
      return `El alcance "${grant?.scope}" no admite resourceId; en "${grant?.actionId}" se guarda vacío.`;
    },
    validationOptions,
  );
}

/** El navegador debe confirmar la versión del catálogo con la que asigna (OCC). */
export function IsExpectedCatalogVersion(validationOptions?: ValidationOptions) {
  return validateBy(
    'isExpectedCatalogVersion',
    (value) => value === ACCESS_CATALOG_VERSION,
    (args) =>
      `expectedCatalogVersion debe ser "${ACCESS_CATALOG_VERSION}" (versión vigente del catálogo). Recibido: ${JSON.stringify(args.value)}.`,
    validationOptions,
  );
}

/** El scope declarado por el navegador nunca es autoridad (BASE-04 §6). */
export function IsNoClientDeclaredScope(validationOptions?: ValidationOptions) {
  return validateBy(
    'isNoClientDeclaredScope',
    (value) => value === undefined,
    () =>
      'clientDeclaredScope nunca autoriza: el alcance declarado por el navegador no es autoridad en el servidor.',
    validationOptions,
  );
}

export class AssignAccessGrantDto {
  @ApiProperty({ description: 'ID de acción en formato apartado:acción', example: 'customers:read' })
  @IsAssignableAction()
  actionId: string;

  @ApiProperty({
    description: 'Alcance concedido para esta acción',
    enum: ['own', 'team', 'list', 'product', 'global'],
  })
  @IsScopeAllowedForAction()
  scope: AccessScope;

  @ApiPropertyOptional({ description: 'Recurso concreto; obligatorio en list/product' })
  @IsResourceIdConsistentWithScope()
  resourceId?: string;
}

export class AssignAccessDto {
  @ApiPropertyOptional({
    description: 'Usuario destino; puede venir en la ruta REST en lugar del cuerpo',
  })
  @IsOptional()
  @Matches(/\S/, { message: 'userId no puede estar vacío cuando se envía en el cuerpo' })
  userId?: string;

  @ApiProperty({ type: () => [AssignAccessGrantDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AssignAccessGrantDto)
  grants: AssignAccessGrantDto[];

  @ApiProperty({ description: 'Versión del catálogo con la que asigna', example: ACCESS_CATALOG_VERSION })
  @IsExpectedCatalogVersion()
  expectedCatalogVersion: string;

  @ApiPropertyOptional({ description: 'Clave de idempotencia del administrador' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Motivo de la asignación, para auditoría' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Rechazado deliberadamente: el scope del navegador nunca autoriza',
  })
  @IsNoClientDeclaredScope()
  clientDeclaredScope?: AccessScope;
}
