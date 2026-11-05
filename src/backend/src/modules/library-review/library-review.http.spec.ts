import { ConflictException, INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryReviewController } from './library-review.controller';
import { LibraryReviewService } from './library-review.service';

// Route/DTO/RolesGuard proof with a synthetic authentication stub; no database,
// real token/session authentication or production application is exercised.
describe('library review HTTP permission contract', () => {
  let app: INestApplication;
  const service = { review: jest.fn(), recordGap: jest.fn(), recordEvidence: jest.fn(), resolveGap: jest.fn() };
  const path = '/api/library/products/fixture/review';
  const input = { gapKey: 'datasheet', status: 'NO_ENCONTRADO', severity: 'AVISO', expectedOpenId: null };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [LibraryReviewController], providers: [{ provide: LibraryReviewService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const role = req.headers['x-fixture-role'];
        if (!role) throw new UnauthorizedException();
        req.user = { sub: 'actor-fixture', name: 'Actor fixture', roles: [role] };
        return true;
      } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    service.review.mockResolvedValue({ productId: 'fixture', gaps: [], evidence: [] });
    service.recordGap.mockResolvedValue({ id: 'gap-fixture' });
  });
  afterAll(async () => { await app?.close(); });
  it('anonymous cannot read review', async () => { await request(app.getHttpServer()).get(path).expect(401); expect(service.review).not.toHaveBeenCalled(); });
  it('authenticated read reaches the per-product ACL context', async () => {
    await request(app.getHttpServer()).get(path).set('x-fixture-role', 'Consulta').expect(200);
    expect(service.review).toHaveBeenCalledWith('fixture', { userId: 'actor-fixture', name: 'Actor fixture', roles: ['Consulta'] });
  });
  it('Consulta cannot mutate despite authenticated read', async () => {
    await request(app.getHttpServer()).put(path + '/gaps').set('x-fixture-role', 'Consulta').send(input).expect(403);
    expect(service.recordGap).not.toHaveBeenCalled();
  });
  it('Admin Comercial still requires the service ACL grant', async () => {
    service.recordGap.mockRejectedValue(new NotFoundException('Producto no encontrado'));
    await request(app.getHttpServer()).put(path + '/gaps').set('x-fixture-role', 'Admin Comercial').send(input).expect(404);
  });
  it('stale comparison is 409, without automatic retry', async () => {
    service.recordGap.mockRejectedValue(new ConflictException('El faltante cambió'));
    await request(app.getHttpServer()).put(path + '/gaps').set('x-fixture-role', 'Super Admin').send(input).expect(409);
    expect(service.recordGap).toHaveBeenCalledTimes(1);
  });
  it('invalid status or unknown body fields are rejected before the service', async () => {
    await request(app.getHttpServer()).put(path + '/gaps').set('x-fixture-role', 'Super Admin').send({ ...input, status: 'INVALID' }).expect(400);
    await request(app.getHttpServer()).put(path + '/gaps').set('x-fixture-role', 'Super Admin').send({ ...input, userId: 'spoofed' }).expect(400);
    expect(service.recordGap).not.toHaveBeenCalled();
  });
  it('accepted first review carries null token and JWT actor, no body actor', async () => {
    await request(app.getHttpServer()).put(path + '/gaps').set('x-fixture-role', 'Super Admin').send(input).expect(200);
    expect(service.recordGap).toHaveBeenCalledWith('fixture', expect.objectContaining(input), expect.objectContaining({ userId: 'actor-fixture' }));
  });
});
