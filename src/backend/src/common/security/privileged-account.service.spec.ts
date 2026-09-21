import { ForbiddenException } from '@nestjs/common';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

import { PrivilegedAccountService } from './privileged-account.service';

// ---------------------------------------------------------------------------
// Escenarios cubiertos (S.5 del hardening):
// ✅ Un Super Admin no puede cambiar su propio rol ni su propio estado
// ✅ No se puede desactivar/eliminar al último Super Admin (break-glass)
// ✅ Sí se permite cuando quedan suficientes Super Admin
// ✅ Un usuario no privilegiado no activa el break-glass
// ✅ willRemoveSuperAdmin detecta la retirada del rol
// ---------------------------------------------------------------------------

describe('PrivilegedAccountService', () => {
  let service: PrivilegedAccountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrivilegedAccountService(mockPrisma as any);
  });

  describe('assertNotSelfPrivilegeChange', () => {
    /**
     * Si un atacante toma una sesión de Super Admin, sin esta regla podría
     * consolidarse degradando a los demás. Exigir que sea *otro* Super Admin
     * quien toque roles mantiene el control repartido.
     */
    it('rechaza que el actor se modifique a sí mismo', () => {
      expect(() =>
        service.assertNotSelfPrivilegeChange('user-1', 'user-1'),
      ).toThrow(ForbiddenException);
    });

    it('permite modificar a otro usuario', () => {
      expect(() =>
        service.assertNotSelfPrivilegeChange('user-1', 'user-2'),
      ).not.toThrow();
    });
  });

  describe('assertBreakGlass', () => {
    it('no interviene si el usuario no es Super Admin', async () => {
      mockPrisma.userRole.count.mockResolvedValue(0);

      await expect(
        service.assertBreakGlass('user-1', 'eliminar'),
      ).resolves.toBeUndefined();

      // Ni siquiera necesita contar los Super Admin restantes.
      expect(mockPrisma.user.count).not.toHaveBeenCalled();
    });

    /**
     * Con un solo Super Admin, eliminarlo deja el sistema sin nadie capaz de
     * administrar roles ni desbloquear cuentas, y sin forma de recuperarlo desde
     * la aplicación.
     */
    it('rechaza dejar el sistema sin Super Admin', async () => {
      mockPrisma.userRole.count.mockResolvedValue(1);
      mockPrisma.user.count.mockResolvedValue(0);

      await expect(
        service.assertBreakGlass('user-1', 'eliminar este usuario'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite la operación si queda otro Super Admin activo', async () => {
      mockPrisma.userRole.count.mockResolvedValue(1);
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(
        service.assertBreakGlass('user-1', 'desactivar este usuario'),
      ).resolves.toBeUndefined();
    });

    it('excluye al propio usuario al contar los restantes', async () => {
      mockPrisma.userRole.count.mockResolvedValue(1);
      mockPrisma.user.count.mockResolvedValue(2);

      await service.assertBreakGlass('user-1', 'desactivar');

      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'user-1' } }),
        }),
      );
    });
  });

  describe('willRemoveSuperAdmin', () => {
    it('detecta que la nueva lista de roles retira Super Admin', async () => {
      mockPrisma.userRole.count.mockResolvedValue(1);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-sa' });

      expect(await service.willRemoveSuperAdmin('user-1', ['role-otro'])).toBe(
        true,
      );
    });

    it('devuelve false si la nueva lista conserva Super Admin', async () => {
      mockPrisma.userRole.count.mockResolvedValue(1);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-sa' });

      expect(
        await service.willRemoveSuperAdmin('user-1', ['role-sa', 'role-otro']),
      ).toBe(false);
    });

    it('devuelve false si el usuario no era Super Admin', async () => {
      mockPrisma.userRole.count.mockResolvedValue(0);

      expect(await service.willRemoveSuperAdmin('user-1', [])).toBe(false);
    });
  });
});
