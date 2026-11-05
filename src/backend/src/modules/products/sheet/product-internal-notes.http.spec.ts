import 'reflect-metadata';
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../product-library';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ProductInternalNotesController } from './product-internal-notes.controller';
import { ProductInternalNotesService } from './product-internal-notes.service';
import { INTERNAL_NOTE_MAX_LENGTH } from './dto/internal-note.dto';

/**
 * HTTP contract of the internal-notes endpoints: real controller, real service, real guards and the
 * same global ValidationPipe as `main.ts`. Only Prisma, the grants and the audit sink are fakes.
 * Auth is simulated: `x-test-user` picks the user id, `x-test-roles` the job roles.
 */

const PRODUCT_ID = '69ba44ee-7081-475b-8f00-b3220364bee5';
const BASE = `/api/products/${PRODUCT_ID}/internal-notes`;

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const roles = req.headers['x-test-roles'];
    if (!roles) return false;
    req.user = { sub: req.headers['x-test-user'] ?? 'user-1', roles: String(roles).split(','), name: 'Nombre del token' };
    return true;
  }
}

const noteRow = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  productId: PRODUCT_ID,
  authorId: 'user-1',
  authorName: 'Laura Pérez',
  text: 'Proveedor confirmó stock para noviembre',
  version: 0,
  createdAt: new Date('2026-10-28T14:11:00Z'),
  updatedAt: new Date('2026-10-28T14:11:00Z'),
  ...over,
});

describe('ProductInternalNotesController (HTTP)', () => {
  let app: INestApplication;
  let prisma: any;
  let audit: { logTx: jest.Mock };
  let grantRows: Array<{ sourceId: string; actionId: string; scope: string }>;

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: PRODUCT_ID }) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Laura Pérez' }) },
      productInternalNote: {
        findMany: jest.fn().mockResolvedValue([noteRow({ id: 'n-2', authorId: 'user-2', authorName: 'Otra Persona' }), noteRow()]),
        findFirst: jest.fn().mockResolvedValue(noteRow()),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => noteRow({ id: 'n-new', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(noteRow({ text: 'Editada', version: 1 })),
      },
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(prisma)),
    };
    audit = { logTx: jest.fn().mockResolvedValue(undefined) };
    grantRows = ['products:read', 'products:write', 'products:notes'].map((actionId) => ({ sourceId: `s-${actionId}`, actionId, scope: 'global' }));

    const module = await Test.createTestingModule({
      controllers: [ProductInternalNotesController],
      providers: [
        { provide: AccessAssignmentsService, useValue: { grantsForUser: jest.fn(async () => grantRows) } },
        ProductInternalNotesService,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: BibliotecaPrismaService, useValue: directLegacyProductLibrary(prisma) },
        LibraryAuditService,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (req: request.Test, user = 'user-1', roles = 'Operador') => req.set('x-test-user', user).set('x-test-roles', roles);

  it('sin credenciales: 403 en las tres rutas y no se toca nada', async () => {
    expect((await http().get(BASE)).status).toBe(403);
    expect((await http().post(BASE).send({ text: 'a' })).status).toBe(403);
    expect((await http().patch(`${BASE}/n-1`).send({ text: 'a' })).status).toBe(403);
    expect(prisma.productInternalNote.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['sin ninguna concesión', []],
    ['solo products:write', ['products:read', 'products:write']],
    ['solo products:notes', ['products:read', 'products:notes']],
  ])('%s: 403 en GET, POST y PATCH aunque el cargo sea Admin Comercial', async (_label, actionIds) => {
    grantRows = actionIds.map((actionId) => ({ sourceId: `s-${actionId}`, actionId, scope: 'global' }));
    expect((await as(http().get(BASE), 'user-1', 'Admin Comercial')).status).toBe(403);
    expect((await as(http().post(BASE).send({ text: 'a' }), 'user-1', 'Admin Comercial')).status).toBe(403);
    expect((await as(http().patch(`${BASE}/n-1`).send({ text: 'a' }), 'user-1', 'Admin Comercial')).status).toBe(403);
    expect(prisma.productInternalNote.findMany).not.toHaveBeenCalled();
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('GET devuelve la lista en el sobre {data} con canEdit calculado por el servidor', async () => {
    const res = await as(http().get(BASE));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: 'n-2', text: 'Proveedor confirmó stock para noviembre', authorName: 'Otra Persona', createdAt: '2026-10-28T14:11:00.000Z', updatedAt: null, canEdit: false, version: 0 },
      { id: 'n-1', text: 'Proveedor confirmó stock para noviembre', authorName: 'Laura Pérez', createdAt: '2026-10-28T14:11:00.000Z', updatedAt: null, canEdit: true, version: 0 },
    ]);
  });

  it('POST crea la nota (201), la audita y devuelve la nota con canEdit verdadero', async () => {
    const res = await as(http().post(BASE).send({ text: '  Revisar garantía  ' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 'n-new', text: 'Revisar garantía', authorName: 'Laura Pérez', canEdit: true });
    expect(audit.logTx).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'create_internal_note', entityId: PRODUCT_ID }));
  });

  it('POST con texto vacío o ausente: 400 y no escribe', async () => {
    const empty = await as(http().post(BASE).send({ text: '   ' }));
    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({ code: 'INTERNAL_NOTE_EMPTY', message: 'Escribe el texto de la nota.' });
    expect((await as(http().post(BASE).send({}))).status).toBe(400);
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
  });

  it('POST con texto demasiado largo: 400 y no escribe', async () => {
    const res = await as(http().post(BASE).send({ text: 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1) }));
    expect(res.status).toBe(400);
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
  });

  it('POST no deja fijar autor ni otros campos desde el cuerpo (la autoría sale de la sesión)', async () => {
    const res = await as(http().post(BASE).send({ text: 'hola', authorId: 'user-99', authorName: 'Falso' }));
    expect(res.status).toBe(400);
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
  });

  it('PATCH por el autor: 200 y devuelve la nota editada', async () => {
    const res = await as(http().patch(`${BASE}/n-1`).send({ text: 'Editada', expectedVersion: 0 }));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'n-1', text: 'Editada', version: 1, canEdit: true });
    expect(audit.logTx).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'update_internal_note' }));
  });

  it.each([['Operador'], ['Admin Comercial'], ['Super Admin']])('PATCH de la nota de otra persona (cargo %s): 403 en español con código y sin escribir', async (role) => {
    const res = await as(http().patch(`${BASE}/n-1`).send({ text: 'Intento ajeno' }), 'user-2', role);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'INTERNAL_NOTE_NOT_AUTHOR', message: 'Solo quien escribió la nota puede editarla.' });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('PATCH con versión desactualizada: 409 con código y versión vigente', async () => {
    prisma.productInternalNote.findFirst.mockResolvedValue(noteRow({ version: 2 }));
    const res = await as(http().patch(`${BASE}/n-1`).send({ text: 'Editada', expectedVersion: 0 }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INTERNAL_NOTE_VERSION_CONFLICT' });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('PATCH de una nota que no existe: 404', async () => {
    prisma.productInternalNote.findFirst.mockResolvedValue(null);
    const res = await as(http().patch(`${BASE}/n-x`).send({ text: 'Editada' }));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'INTERNAL_NOTE_NOT_FOUND' });
  });

  it('no existe ruta para borrar notas', async () => {
    const res = await as(http().delete(`${BASE}/n-1`));
    expect(res.status).toBe(404);
  });
});
