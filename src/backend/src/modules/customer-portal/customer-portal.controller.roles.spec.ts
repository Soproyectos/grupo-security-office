import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { CustomerPortalController } from './customer-portal.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortalAuthGuard, REQUIRE_APPROVED_KEY } from './portal-auth.guard';

/**
 * Contrato de autorización del portal (PORTAL-02). Regresión de los dos
 * hallazgos de la revisión: @Roles() sin RolesGuard aplicado es metadata
 * muerta, y las rutas de sesión de cliente sin @Public() quedan bloqueadas
 * por el guard global interno antes de alcanzar PortalAuthGuard.
 */
describe('CustomerPortalController — matriz de autorización (contrato)', () => {
  const proto = CustomerPortalController.prototype as any;
  const rolesOf = (method: Function): string[] => Reflect.getMetadata(ROLES_KEY, method) ?? [];
  const isPublic = (method: Function): boolean => Reflect.getMetadata(IS_PUBLIC_KEY, method) === true;
  // Nest almacena @UseGuards bajo '__guards__' (GUARDS_METADATA) sobre el
  // método (descriptor.value), no sobre la clase.
  const guardsOf = (method: Function): any[] => Reflect.getMetadata('__guards__', method) ?? [];

  // ---------- Cuentas del portal: acción de panel con alcance (ya no solo Super Admin) ----------

  const PANEL_ROUTES = ['pending', 'approve', 'reject', 'accounts', 'tiers', 'suspend', 'reactivate', 'assignTier', 'linkCustomer', 'assignAdvisor'];

  it('las rutas de cuentas del portal no fijan roles: el servicio exige la acción de panel y su alcance', () => {
    for (const name of PANEL_ROUTES) expect(rolesOf(proto[name])).toEqual([]);
  });

  it('las rutas de cuentas del portal exigen la sesión interna (JwtAuthGuard), no son públicas y no usan RolesGuard', () => {
    for (const name of PANEL_ROUTES) {
      const guards = guardsOf(proto[name]);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).not.toContain(RolesGuard);
      expect(isPublic(proto[name])).toBe(false);
    }
  });

  it('cada ruta pasa la identidad de la sesión (nunca del cuerpo) al servicio', async () => {
    const portal: any = {
      listPending: jest.fn(), approve: jest.fn(), reject: jest.fn(), listAccounts: jest.fn(), listTiersFor: jest.fn(), suspend: jest.fn(),
      reactivate: jest.fn(), assignTier: jest.fn(), linkCustomer: jest.fn(), assignAdvisor: jest.fn(),
    };
    const controller = new CustomerPortalController(portal, { get: jest.fn() } as any);
    const user = { sub: 'u1', roles: ['Vendedor'], jti: 'j1' };
    const ctx = { userId: 'u1', roles: ['Vendedor'], jti: 'j1' };
    controller.pending(user); controller.accounts(user); controller.tiers(user);
    controller.approve('a1', {} as any, user); controller.reject('a1', { reason: 'xxx' } as any, user);
    controller.suspend('a1', { reason: 'xxx' } as any, user); controller.reactivate('a1', user);
    controller.assignTier('a1', { tierId: null } as any, user); controller.linkCustomer('a1', { customerId: 'c1' } as any, user);
    controller.assignAdvisor('a1', { advisorId: 'adv' } as any, user);
    expect(portal.listPending).toHaveBeenCalledWith(ctx);
    expect(portal.listAccounts).toHaveBeenCalledWith(ctx);
    expect(portal.listTiersFor).toHaveBeenCalledWith(ctx);
    expect(portal.approve).toHaveBeenCalledWith('a1', {}, ctx);
    expect(portal.reject).toHaveBeenCalledWith('a1', { reason: 'xxx' }, ctx);
    expect(portal.suspend).toHaveBeenCalledWith('a1', 'xxx', ctx);
    expect(portal.reactivate).toHaveBeenCalledWith('a1', ctx);
    expect(portal.assignTier).toHaveBeenCalledWith('a1', { tierId: null }, ctx);
    expect(portal.linkCustomer).toHaveBeenCalledWith('a1', 'c1', ctx);
    expect(portal.assignAdvisor).toHaveBeenCalledWith('a1', { advisorId: 'adv' }, ctx);
  });

  // ---------- Tarifa general y niveles: acción portalTariffs:manage (ver customer-portal.tariffs.spec.ts) ----------

  it('GET/POST admin/price-list-mappings van tras la sesión interna; el servicio exige portalTariffs:manage', () => {
    for (const method of [proto.listMappings, proto.mapping]) expect(guardsOf(method)).toContain(JwtAuthGuard);
  });

  // ---------- Aislamiento de sesiones ----------

  it('las rutas de sesión de cliente son @Public + PortalAuthGuard (el guard interno no debe bloquearlas)', () => {
    for (const method of [proto.me, proto.logout, proto.customerPrices]) {
      expect(isPublic(method)).toBe(true);
      expect(guardsOf(method)).toContain(PortalAuthGuard);
    }
  });

  it('las rutas con precios exigen cuenta aprobada (RequireApprovedPortalAccount); perfil y sesión no', () => {
    const required = (method: Function) => Reflect.getMetadata(REQUIRE_APPROVED_KEY, method) === true;
    for (const method of [proto.customerPrices, proto.createQuote, proto.listQuotes, proto.quoteDetail]) expect(required(method)).toBe(true);
    for (const method of [proto.me, proto.updateProfile, proto.logout, proto.createPassword, proto.requestDeletion, proto.deleteOwnAccount]) expect(required(method)).toBe(false);
  });

  it('la ruta pública de login es @Public', () => {
    for (const method of [proto.login]) {
      expect(isPublic(method)).toBe(true);
    }
  });

  it('las rutas admin NO son públicas: requieren la sesión interna del panel', () => {
    for (const method of [proto.listMappings, proto.mapping, proto.createTier, proto.editTier]) {
      expect(isPublic(method)).toBe(false);
    }
  });

  it('la clase no aplica guards a nivel global (exigiría sesión interna en rutas públicas)', () => {
    expect(Reflect.getMetadata('__guards__', CustomerPortalController)).toBeUndefined();
  });
  it('crear y editar escalafones van tras la sesión interna; el servicio exige portalTariffs:manage', () => {
    for (const method of [proto.createTier, proto.editTier]) expect(guardsOf(method)).toContain(JwtAuthGuard);
  });

});
