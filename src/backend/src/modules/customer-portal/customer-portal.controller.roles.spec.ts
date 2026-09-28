import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { CustomerPortalController } from './customer-portal.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortalAuthGuard } from './portal-auth.guard';

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

  // ---------- Rutas internas de revisión: sólo los 3 roles autorizados ----------

  it('GET admin/accounts/pending exige exactamente Supervisor, Admin Comercial y Super Admin', () => {
    expect(rolesOf(proto.pending)).toEqual(['Super Admin', 'Supervisor', 'Admin Comercial']);
  });

  it('POST admin/accounts/:id/approve exige exactamente los 3 roles de revisión', () => {
    expect(rolesOf(proto.approve)).toEqual(['Super Admin', 'Supervisor', 'Admin Comercial']);
  });

  it('POST admin/accounts/:id/reject exige exactamente los 3 roles de revisión', () => {
    expect(rolesOf(proto.reject)).toEqual(['Super Admin', 'Supervisor', 'Admin Comercial']);
  });

  it('los endpoints de revisión aplican RolesGuard y JwtAuthGuard (sin él, @Roles es metadata muerta)', () => {
    for (const method of [proto.pending, proto.approve, proto.reject]) {
      const guards = guardsOf(method);
      expect(guards).toContain(RolesGuard);
      expect(guards).toContain(JwtAuthGuard);
    }
  });

  // ---------- Configuración de tarifas por tipo: área comercial ----------

  it('GET/POST admin/price-list-mappings exigen Super Admin y Admin Comercial con RolesGuard', () => {
    for (const method of [proto.listMappings, proto.mapping]) {
      expect(rolesOf(method)).toEqual(['Super Admin', 'Admin Comercial']);
      expect(guardsOf(method)).toContain(RolesGuard);
      expect(guardsOf(method)).toContain(JwtAuthGuard);
    }
  });

  // ---------- Aislamiento de sesiones ----------

  it('las rutas de sesión de cliente son @Public + PortalAuthGuard (el guard interno no debe bloquearlas)', () => {
    for (const method of [proto.me, proto.logout, proto.customerCatalog, proto.customerProductDetail]) {
      expect(isPublic(method)).toBe(true);
      expect(guardsOf(method)).toContain(PortalAuthGuard);
    }
  });

  it('las rutas públicas (catálogo sin precios, registro, login) son @Public', () => {
    for (const method of [proto.publicCatalog, proto.publicProductDetail, proto.register, proto.login]) {
      expect(isPublic(method)).toBe(true);
    }
  });

  it('las rutas admin NO son públicas: requieren la sesión interna del panel', () => {
    for (const method of [proto.pending, proto.approve, proto.reject, proto.listMappings, proto.mapping]) {
      expect(isPublic(method)).toBe(false);
    }
  });

  it('la clase no aplica guards a nivel global (exigiría sesión interna en rutas públicas)', () => {
    expect(Reflect.getMetadata('__guards__', CustomerPortalController)).toBeUndefined();
  });
});
