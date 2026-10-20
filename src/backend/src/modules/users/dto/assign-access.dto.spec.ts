/**
 * BASE-04 unidad 2 — DTO de asignación de concesiones por acción (§8: 400 con
 * mensajes claros; ficha writePath `modules/users/dto/assign-access.dto.ts`).
 *
 * RED observado: estos specs deben fallar mientras `./assign-access.dto` no
 * exista (Cannot find module).
 */
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ACCESS_CATALOG_VERSION } from '../../../common/security/access-catalog';
import { AssignAccessDto } from './assign-access.dto';

function collect(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collect(error.children ?? []),
  ]);
}

async function messagesOf(payload: unknown): Promise<string[]> {
  const dto = plainToInstance(AssignAccessDto, payload as object);
  return collect(await validate(dto, { whitelist: false }));
}

const validPayload = () => ({
  userId: 'u-destino',
  expectedCatalogVersion: ACCESS_CATALOG_VERSION,
  reason: 'alta inicial',
  grants: [
    { actionId: 'customers:read', scope: 'team' },
    { actionId: 'customers:edit', scope: 'own' },
    { actionId: 'products:read', scope: 'list', resourceId: 'lista-1' },
  ],
});

describe('AssignAccessDto (BASE-04 §7.3, §8)', () => {
  it('acepta una asignación bien formada con catálogo vigente', async () => {
    expect(await messagesOf(validPayload())).toEqual([]);
  });

  it('acepta sin userId: el destino puede venir de la ruta REST', async () => {
    const { userId: _omitido, ...withoutUserId } = validPayload();
    expect(await messagesOf(withoutUserId)).toEqual([]);
  });

  describe('formato de acción `apartado:acción` (vía catálogo)', () => {
    it('rechaza los permisos legacy de tres segmentos', async () => {
      const payload = validPayload();
      payload.grants[0] = { actionId: 'dashboard:pack:ventas' as never, scope: 'team' as never };
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toContain('dashboard:pack:ventas');
      expect(messages.join('\n')).toMatch(/apartado:acción/);
    });

    it('rechaza los IDs con punto del worktree UA', async () => {
      const payload = validPayload();
      payload.grants[0] = { actionId: 'commercial.customers.view' as never, scope: 'team' as never };
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toContain('commercial.customers.view');
    });

    it('rechaza una acción que no existe en el catálogo', async () => {
      const payload = validPayload();
      payload.grants[1] = { actionId: 'customers:export' as never, scope: 'own' as never };
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toMatch(/no existe en el catálogo/);
    });

    it('rechaza una acción deshabilitada (no se puede conceder lo que no honra)', async () => {
      const payload = validPayload();
      payload.grants[1] = { actionId: 'stockRequests:read' as never, scope: 'own' as never };
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toMatch(/deshabilitada/);
    });
  });

  describe('alcance permitido por allowedScopes', () => {
    it('rechaza un alcance que la definición no admite y lista los permitidos', async () => {
      const payload = validPayload();
      payload.grants[2] = {
        actionId: 'products:read',
        scope: 'own' as never,
        resourceId: 'lista-1',
      };
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toMatch(/no admite el alcance "own"/);
      expect(messages.join('\n')).toMatch(/list, product, global/);
    });

    it('rechaza un alcance que no existe', async () => {
      const payload = validPayload();
      payload.grants[0] = { actionId: 'customers:read', scope: 'teame' as never };
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toMatch(/no admite el alcance "teame"/);
    });

    it('exige resourceId para alcance list y lo prohíbe para own/team/global', async () => {
      const sinRecurso = validPayload();
      sinRecurso.grants[2] = { actionId: 'products:read', scope: 'list' as never };
      expect((await messagesOf(sinRecurso)).join('\n')).toMatch(/resourceId/);

      const conRecursoDeMas = validPayload();
      conRecursoDeMas.grants[0] = {
        actionId: 'customers:read',
        scope: 'team' as never,
        resourceId: 'lista-1',
      };
      expect((await messagesOf(conRecursoDeMas)).join('\n')).toMatch(/resourceId/);
    });
  });

  describe('versión de catálogo esperada (OCC)', () => {
    it('exige expectedCatalogVersion', async () => {
      const payload = validPayload() as Record<string, unknown>;
      delete payload.expectedCatalogVersion;
      const messages = await messagesOf(payload);
      expect(messages.join('\n')).toMatch(/expectedCatalogVersion/);
    });

    it('rechaza una versión desactualizada y nombra la vigente', async () => {
      const messages = await messagesOf({
        ...validPayload(),
        expectedCatalogVersion: 'base02-0',
      });
      expect(messages.join('\n')).toContain('base02-0');
      expect(messages.join('\n')).toContain(ACCESS_CATALOG_VERSION);
    });
  });

  describe('scope del navegador nunca es campo autoritativo (§6, ficha caso 3)', () => {
    it('rechaza clientDeclaredScope en el cuerpo con mensaje explícito', async () => {
      const messages = await messagesOf({
        ...validPayload(),
        clientDeclaredScope: 'global',
      });
      expect(messages.join('\n')).toMatch(/nunca autoriza/i);
    });

    it('rechaza propiedades de scope ajenas con las mismas opciones del pipe global', async () => {
      // Mismas opciones que `main.ts` (whitelist + forbidNonWhitelisted).
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      await expect(
        pipe.transform({ ...validPayload(), scope: 'global' }, {
          type: 'body',
          metatype: AssignAccessDto,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('estructura', () => {
    it('exige grants como arreglo y acota su tamaño', async () => {
      expect((await messagesOf({ ...validPayload(), grants: 'customers:read' })).length)
        .toBeGreaterThan(0);
      expect((await messagesOf({
        ...validPayload(),
        grants: Array.from({ length: 201 }, () => ({ actionId: 'customers:read', scope: 'team' })),
      })).length).toBeGreaterThan(0);
    });

    it('rechaza un userId vacío cuando viene en el cuerpo', async () => {
      const messages = await messagesOf({ ...validPayload(), userId: '   ' });
      expect(messages.join('\n')).toMatch(/userId/);
    });
  });
});
