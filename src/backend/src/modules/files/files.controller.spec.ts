import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/**
 * CAT-04 (D4): el serve público conserva la cabecera inmutable; un archivo
 * PRIVATE exige sesión + acceso al dueño, con todos los rechazos duros del
 * JwtStrategy (token de desafío, usuario inactivo, sesión revocada).
 */
describe('FilesController', () => {
  const record = (over: Record<string, unknown> = {}) => ({
    id: 'file-id',
    mimeType: 'image/png',
    data: Buffer.from('png-bytes'),
    visibility: 'PUBLIC',
    ownerProductId: null,
    ...over,
  });

  const buildRes = () => {
    const res: any = {
      headers: {} as Record<string, string>,
      set(headers: Record<string, string>) {
        Object.assign(this.headers, headers);
        return this;
      },
      send: jest.fn(),
    };
    return res;
  };

  let controller: FilesController;
  let filesService: { getRecord: jest.Mock };
  let jwt: { verify: jest.Mock };
  let sessions: { isActive: jest.Mock };
  let acl: { assertProductAccess: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    filesService = { getRecord: jest.fn() };
    jwt = { verify: jest.fn().mockReturnValue({ sub: 'user-1', roles: ['Admin Comercial'], jti: 'jti-1' }) };
    sessions = { isActive: jest.fn().mockResolvedValue(true) };
    acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: null }) };
    prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true }) } };
    controller = new FilesController(
      filesService as unknown as FilesService,
      jwt as never,
      sessions as never,
      acl as never,
      prisma as never,
    );
  });

  const req = (cookie?: string) =>
    ({ cookies: cookie ? { access_token: cookie } : {}, headers: cookie ? { cookie: `access_token=${cookie}` } : {} }) as never;

  it('sirve el archivo PÚBLICO con Content-Type, Cache-Control y CORP cross-origin', async () => {
    filesService.getRecord.mockResolvedValue(record());
    const res = buildRes();

    await controller.serve('file-id', req(), res);

    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('png-bytes'));
  });

  it('lanza 404 cuando el archivo no existe', async () => {
    filesService.getRecord.mockResolvedValue(null);
    await expect(controller.serve('missing', req(), buildRes())).rejects.toThrow(NotFoundException);
  });

  it('401 sin sesión para un archivo PRIVATE', async () => {
    filesService.getRecord.mockResolvedValue(record({ visibility: 'PRIVATE', ownerProductId: 'prod-1' }));
    await expect(controller.serve('file-id', req(), buildRes())).rejects.toThrow(UnauthorizedException);
    expect(acl.assertProductAccess).not.toHaveBeenCalled();
  });

  it('PRIVATE con sesión válida y acceso: sirve con private, no-store', async () => {
    filesService.getRecord.mockResolvedValue(record({ visibility: 'PRIVATE', ownerProductId: 'prod-1' }));
    const res = buildRes();

    await controller.serve('file-id', req('tok'), res);

    expect(jwt.verify).toHaveBeenCalledWith('tok');
    expect(acl.assertProductAccess).toHaveBeenCalledWith('prod-1', { userId: 'user-1', roles: ['Admin Comercial'] }, 'view');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['Cross-Origin-Resource-Policy']).toBeUndefined();
    expect(res.send).toHaveBeenCalled();
  });

  it('403 cuando el ACL del dueño niega el acceso', async () => {
    filesService.getRecord.mockResolvedValue(record({ visibility: 'PRIVATE', ownerProductId: 'prod-1' }));
    acl.assertProductAccess.mockRejectedValue(new ForbiddenException('Acceso restringido'));
    await expect(controller.serve('file-id', req('tok'), buildRes())).rejects.toThrow(ForbiddenException);
  });

  it('fail-closed: PRIVATE sin producto dueño nunca se sirve', async () => {
    filesService.getRecord.mockResolvedValue(record({ visibility: 'PRIVATE', ownerProductId: null }));
    await expect(controller.serve('file-id', req('tok'), buildRes())).rejects.toThrow(ForbiddenException);
    expect(acl.assertProductAccess).not.toHaveBeenCalled();
  });

  it('rechaza token de desafío MFA y sesión revocada (como jwt.strategy)', async () => {
    filesService.getRecord.mockResolvedValue(record({ visibility: 'PRIVATE', ownerProductId: 'prod-1' }));
    jwt.verify.mockReturnValue({ sub: 'user-1', scope: 'mfa', jti: 'jti-1' });
    await expect(controller.serve('file-id', req('tok'), buildRes())).rejects.toThrow(UnauthorizedException);

    jwt.verify.mockReturnValue({ sub: 'user-1', roles: [], jti: 'jti-x' });
    sessions.isActive.mockResolvedValue(false);
    await expect(controller.serve('file-id', req('tok'), buildRes())).rejects.toThrow(UnauthorizedException);
  });

  it('usuario inactivo → 401', async () => {
    filesService.getRecord.mockResolvedValue(record({ visibility: 'PRIVATE', ownerProductId: 'prod-1' }));
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: false });
    await expect(controller.serve('file-id', req('tok'), buildRes())).rejects.toThrow(UnauthorizedException);
  });
});
