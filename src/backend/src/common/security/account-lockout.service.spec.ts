import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

import { AccountLockoutService } from './account-lockout.service';

// ---------------------------------------------------------------------------
// Escenarios cubiertos (S.3 del hardening):
// ✅ Sin fallos → no bloqueada
// ✅ 5 fallos → bloqueo de 15 min
// ✅ 10 fallos → bloqueo de 1 h
// ✅ 15 fallos → bloqueo indefinido (until = null)
// ✅ El bloqueo corre desde el fallo que lo disparó, no desde "ahora"
// ✅ Un bloqueo ya vencido deja de bloquear
// ✅ Un acceso correcto reinicia el contador
// ✅ El email se normaliza a minúsculas
// ✅ record() no propaga errores de escritura
// ---------------------------------------------------------------------------

/** Genera N fallos, el más reciente hace `mostRecentMinutesAgo` minutos. */
function failures(count: number, mostRecentMinutesAgo = 0) {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(Date.now() - (mostRecentMinutesAgo + i) * 60_000),
  }));
}

describe('AccountLockoutService', () => {
  let service: AccountLockoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.loginAttempt.findFirst.mockResolvedValue(null);
    service = new AccountLockoutService(mockPrisma as any);
  });

  describe('getStatus', () => {
    it('no bloquea sin fallos', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue([]);

      const status = await service.getStatus('user@test.com');

      expect(status.locked).toBe(false);
      expect(status.recentFailures).toBe(0);
    });

    it('no bloquea con 4 fallos', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue(failures(4));

      expect((await service.getStatus('user@test.com')).locked).toBe(false);
    });

    it('bloquea 15 minutos a los 5 fallos', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue(failures(5));

      const status = await service.getStatus('user@test.com');

      expect(status.locked).toBe(true);
      expect(status.until).not.toBeNull();

      const minutes = (status.until!.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(13);
      expect(minutes).toBeLessThanOrEqual(15);
    });

    it('bloquea 1 hora a los 10 fallos', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue(failures(10));

      const status = await service.getStatus('user@test.com');
      const minutes = (status.until!.getTime() - Date.now()) / 60_000;

      expect(status.locked).toBe(true);
      expect(minutes).toBeGreaterThan(55);
    });

    it('bloquea indefinidamente a los 15 fallos', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue(failures(15));

      const status = await service.getStatus('user@test.com');

      expect(status.locked).toBe(true);
      expect(status.until).toBeNull();
    });

    /**
     * El bloqueo se cuenta desde el fallo que lo disparó. Si corriera desde
     * "ahora", un atacante podría mantener bloqueada indefinidamente la cuenta
     * de un tercero reintentando cada pocos minutos: una denegación de servicio
     * contra el titular legítimo.
     */
    it('un bloqueo de 15 min ya vencido deja de bloquear', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue(failures(5, 20));

      const status = await service.getStatus('user@test.com');

      expect(status.locked).toBe(false);
      expect(status.recentFailures).toBe(5);
    });

    /**
     * Un acceso correcto marca el corte: los fallos anteriores dejan de contar,
     * pero siguen en la tabla como rastro de auditoría.
     */
    it('reinicia el contador tras un acceso correcto', async () => {
      // Fecha FIJA, no relativa a Date.now(): construir el valor esperado en
      // una linea distinta a la del mock produce dos Date con milisegundos
      // distintos, y el test falla de forma intermitente.
      const ultimoAcceso = new Date('2026-09-21T10:00:00.000Z');

      mockPrisma.loginAttempt.findFirst.mockResolvedValue({
        createdAt: ultimoAcceso,
      });
      mockPrisma.loginAttempt.findMany.mockResolvedValue([]);

      const status = await service.getStatus('user@test.com');

      expect(status.locked).toBe(false);

      // Sólo se cuentan los fallos posteriores al último acceso correcto.
      const where = mockPrisma.loginAttempt.findMany.mock.calls[0][0].where;
      expect(where.createdAt.gt).toEqual(ultimoAcceso);
    });

    it('normaliza el email a minúsculas', async () => {
      mockPrisma.loginAttempt.findMany.mockResolvedValue([]);

      await service.getStatus('USER@TEST.COM');

      expect(mockPrisma.loginAttempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: 'user@test.com' }),
        }),
      );
    });
  });

  describe('record', () => {
    it('guarda el intento normalizando el email', async () => {
      mockPrisma.loginAttempt.create.mockResolvedValue({});

      await service.record({ email: 'USER@TEST.COM', success: false });

      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'user@test.com', success: false }),
        }),
      );
    });

    /**
     * Un fallo al escribir la auditoría no debe impedir el login: dejaría el
     * sistema inaccesible por un problema de la tabla de registro.
     */
    it('no propaga errores de escritura', async () => {
      mockPrisma.loginAttempt.create.mockRejectedValue(new Error('db caída'));

      await expect(
        service.record({ email: 'user@test.com', success: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe('unlock', () => {
    it('elimina los fallos de la cuenta', async () => {
      mockPrisma.loginAttempt.deleteMany.mockResolvedValue({ count: 7 });

      expect(await service.unlock('USER@TEST.COM')).toBe(7);
      expect(mockPrisma.loginAttempt.deleteMany).toHaveBeenCalledWith({
        where: { email: 'user@test.com', success: false },
      });
    });
  });
});
