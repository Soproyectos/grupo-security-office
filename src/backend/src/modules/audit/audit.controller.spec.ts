import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditController } from './audit.controller';

/**
 * La auditoría ya no se protege por cargo: se exige la acción `audit:read` (alcance global)
 * asignada en «Asignar paneles». Super Admin conserva su excepción.
 */
describe('AuditController — acción audit:read', () => {
  const grant = (actionId: string) => ({ sourceId: 's1', actionId, scope: 'global' });
  const make = (grantRows: any[]) => {
    const audit: any = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      findByEntity: jest.fn().mockResolvedValue({ data: [] }),
    };
    const grants: any = { grantsForUser: jest.fn().mockResolvedValue(grantRows) };
    return { controller: new AuditController(audit, grants), audit };
  };
  const asUser = (roles: string[]) => ({ sub: 'u1', roles });
  const call = (c: AuditController, user: any) => c.findAll(undefined, undefined, undefined, undefined, undefined, undefined, user);

  it('las rutas no fijan cargos ni usan RolesGuard', () => {
    const proto = AuditController.prototype as any;
    for (const name of ['findAll', 'findByEntity']) expect(Reflect.getMetadata(ROLES_KEY, proto[name]) ?? []).toEqual([]);
    expect(Reflect.getMetadata('__guards__', AuditController)).not.toContain(RolesGuard);
  });

  it('sin la acción responde 403, aunque la persona tenga el cargo Admin Comercial', async () => {
    const { controller, audit } = make([grant('products:read')]);
    await expect(call(controller, asUser(['Admin Comercial']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.findByEntity('Stock', 's1', asUser(['Admin Comercial']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.findAll).not.toHaveBeenCalled();
    expect(audit.findByEntity).not.toHaveBeenCalled();
  });

  it('con la acción (sin cargo especial) pasa y la Biblioteca no se abre sin fichas con notas', async () => {
    const { controller, audit } = make([grant('audit:read')]);
    await call(controller, asUser(['Operador']));
    expect(audit.findAll).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ libraryWrite: false }));
    await controller.findByEntity('Stock', 's1', asUser(['Operador']));
    expect(audit.findByEntity).toHaveBeenCalled();
    await expect(controller.findByEntity('Product', 'p1', asUser(['Operador']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('con la acción más editar fichas con notas ve también Biblioteca', async () => {
    const { controller, audit } = make([grant('audit:read'), grant('products:read'), grant('products:write'), grant('products:notes')]);
    await call(controller, asUser(['Operador']));
    expect(audit.findAll).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ libraryWrite: true }));
    await controller.findByEntity('Product', 'p1', asUser(['Operador']));
    expect(audit.findByEntity).toHaveBeenCalledWith('Product', 'p1', expect.any(Object));
  });

  it('Super Admin pasa sin concesiones', async () => {
    const { controller, audit } = make([]);
    await call(controller, asUser(['Super Admin']));
    await controller.findByEntity('User', 'u2', asUser(['Super Admin']));
    expect(audit.findAll).toHaveBeenCalled();
    expect(audit.findByEntity).toHaveBeenCalled();
  });

  it('sin sesión identificada responde 403', async () => {
    const { controller } = make([grant('audit:read')]);
    await expect(call(controller, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
