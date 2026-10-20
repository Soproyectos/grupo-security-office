import { Prisma } from '@prisma/client';
import { MfaService } from './mfa.service';

describe('MfaService.startEnrollment', () => {
  it('reutiliza el secreto pendiente cuando otra solicitud gana la creación', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate userId', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const findUnique = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ secret: 'encrypted-existing', enabled: false });
    const create = jest.fn().mockRejectedValue(conflict);
    const decrypt = jest.fn().mockReturnValue('EXISTINGBASE32SECRET');
    const service = new MfaService(
      { userMfa: { findUnique, create } } as never,
      { encrypt: jest.fn(), decrypt } as never,
      { get: jest.fn().mockReturnValue('Grupo Security') } as never,
    );

    const enrollment = await service.startEnrollment('test-user', 'test@gruposecurity.co');

    expect(create).toHaveBeenCalledTimes(1);
    expect(decrypt).toHaveBeenCalledWith('encrypted-existing');
    expect(enrollment.secret).toBe('EXISTINGBASE32SECRET');
    expect(enrollment.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
