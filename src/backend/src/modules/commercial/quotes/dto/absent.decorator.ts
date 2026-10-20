import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Valida que el campo NO venga en la petición (ni siquiera como `null`).
 * class-validator 0.14 no expone `IsUndefined`; el registro cubre el caso que
 * el contrato marca con «prohibido»: presente ⇒ 400, ausente ⇒ OK.
 * (Mismo patrón que `IsAbsent` de `customers/dto/update-customer.dto.ts`,
 * COM-02 §3 — aquí no se comparte el archivo porque writePath es `quotes/**`.)
 */
export function IsAbsent(validationOptions?: ValidationOptions) {
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
