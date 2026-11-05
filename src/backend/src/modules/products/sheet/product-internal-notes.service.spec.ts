import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProductInternalNotesService, INTERNAL_NOTE_ERRORS } from './product-internal-notes.service';
import { INTERNAL_NOTE_MAX_LENGTH } from './dto/internal-note.dto';
import { directLegacyProductLibrary } from '../product-library';

const PRODUCT_ID = '69ba44ee-7081-475b-8f00-b3220364bee5';
const ME = { userId: 'user-1', roles: ['Operador'], userName: 'Nombre del token' };
const OTHER = { userId: 'user-2', roles: ['Operador'], userName: 'Otra Persona' };
const SUPER_ADMIN = { userId: 'user-3', roles: ['Super Admin'], userName: 'Admin' };

const grantsOf = (actionIds: string[]) => ({
  grantsForUser: jest.fn().mockResolvedValue(
    actionIds.map((actionId, index) => ({ sourceId: `src-${index}`, actionId, scope: 'global' })),
  ),
});
const FULL = ['products:read', 'products:write', 'products:notes'];

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

function build(grants = grantsOf(FULL)) {
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue({ id: PRODUCT_ID }) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Laura Pérez' }) },
    productInternalNote: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(noteRow()),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => noteRow({ id: 'n-new', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(prisma)),
  };
  const audit = { logTx: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductInternalNotesService(prisma as never, audit as never, grants as never);
  return { service, prisma, audit, grants };
}

async function catchError(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be rejected');
}

describe('ProductInternalNotesService · permisos', () => {
  it.each([
    ['sin ningún permiso', []],
    ['solo products:read', ['products:read']],
    ['products:write sin products:notes', ['products:read', 'products:write']],
    ['products:notes sin products:write', ['products:read', 'products:notes']],
  ])('%s: listar, escribir y editar dan 403 con código estable y no tocan datos', async (_label, actionIds) => {
    const { service, prisma, audit } = build(grantsOf(actionIds));

    for (const call of [
      () => service.list(PRODUCT_ID, ME),
      () => service.create(PRODUCT_ID, 'hola', ME),
      () => service.update(PRODUCT_ID, 'n-1', 'hola', undefined, ME),
    ]) {
      const error = await catchError(call());
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({
        code: INTERNAL_NOTE_ERRORS.forbidden,
        message: 'No tienes acceso a las notas internas.',
      });
    }
    expect(prisma.productInternalNote.findMany).not.toHaveBeenCalled();
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logTx).not.toHaveBeenCalled();
  });

  it('un cargo no concede nada: Admin Comercial sin concesiones recibe 403', async () => {
    const { service } = build(grantsOf([]));
    await expect(service.list(PRODUCT_ID, { userId: 'u-9', roles: ['Admin Comercial'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Super Admin conserva su excepción para ver y escribir', async () => {
    const { service } = build(grantsOf([]));
    await expect(service.list(PRODUCT_ID, SUPER_ADMIN)).resolves.toEqual([]);
    await expect(service.create(PRODUCT_ID, 'hola', SUPER_ADMIN)).resolves.toMatchObject({ text: 'hola' });
  });

  it('retirar las concesiones (mismo token) deniega la siguiente petición', async () => {
    const grants = grantsOf(FULL);
    const { service } = build(grants);
    await expect(service.list(PRODUCT_ID, ME)).resolves.toEqual([]);
    grants.grantsForUser.mockResolvedValue([]);
    await expect(service.list(PRODUCT_ID, ME)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ProductInternalNotesService · listar', () => {
  it('pide las notas del producto, la más reciente primero, y marca canEdit solo en las propias', async () => {
    const { service, prisma } = build();
    prisma.productInternalNote.findMany.mockResolvedValue([
      noteRow({ id: 'n-3', authorId: 'user-2', authorName: 'Otra Persona', createdAt: new Date('2026-10-28T16:00:00Z') }),
      noteRow({ id: 'n-2', authorId: 'user-1', version: 2, updatedAt: new Date('2026-10-28T15:00:00Z'), createdAt: new Date('2026-10-28T14:30:00Z') }),
      noteRow({ id: 'n-1', authorId: null, authorName: 'Sistema', createdAt: new Date('2026-10-01T10:00:00Z') }),
    ]);

    const list = await service.list(PRODUCT_ID, ME);

    expect(prisma.productInternalNote.findMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(list.map((n) => [n.id, n.canEdit])).toEqual([['n-3', false], ['n-2', true], ['n-1', false]]);
    expect(list.map((n) => n.authorName)).toEqual(['Otra Persona', 'Laura Pérez', 'Sistema']);
    // updatedAt solo existe cuando la nota fue editada.
    expect(list[0].updatedAt).toBeNull();
    expect(list[1].updatedAt).toEqual(new Date('2026-10-28T15:00:00Z'));
    expect(list[2].updatedAt).toBeNull();
    // El servidor no filtra por autor: todas las notas son visibles para quien tiene el permiso.
    expect(list).toHaveLength(3);
  });

  it('las notas migradas («Sistema», sin autor) no son editables ni por Super Admin', async () => {
    const { service, prisma } = build(grantsOf([]));
    prisma.productInternalNote.findMany.mockResolvedValue([noteRow({ id: 'n-1', authorId: null, authorName: 'Sistema' })]);
    const [note] = await service.list(PRODUCT_ID, SUPER_ADMIN);
    expect(note.canEdit).toBe(false);
  });

  it('producto inexistente: 404 con código', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    const error = await catchError(service.list(PRODUCT_ID, ME));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.productNotFound });
  });

  it('el JSON de la nota no incluye el id de autor (solo su nombre)', async () => {
    const { service, prisma } = build();
    prisma.productInternalNote.findMany.mockResolvedValue([noteRow()]);
    const [note] = await service.list(PRODUCT_ID, ME);
    expect(Object.keys(note).sort()).toEqual(['authorName', 'canEdit', 'createdAt', 'id', 'text', 'updatedAt', 'version']);
  });
});

describe('ProductInternalNotesService · escribir', () => {
  it('guarda la nota recortada a nombre de quien escribe (nombre de la cuenta) y la audita en la misma transacción', async () => {
    const { service, prisma, audit } = build();

    const view = await service.create(PRODUCT_ID, '  Revisar garantía  ', ME);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { name: true } });
    expect(prisma.productInternalNote.create).toHaveBeenCalledWith({
      data: { productId: PRODUCT_ID, authorId: 'user-1', authorName: 'Laura Pérez', text: 'Revisar garantía' },
    });
    expect(view).toMatchObject({ id: 'n-new', text: 'Revisar garantía', authorName: 'Laura Pérez', canEdit: true, updatedAt: null });
    expect(audit.logTx).toHaveBeenCalledTimes(1);
    expect(audit.logTx).toHaveBeenCalledWith(prisma, expect.objectContaining({
      userId: 'user-1',
      action: 'create_internal_note',
      entity: 'Product',
      entityId: PRODUCT_ID,
      productId: PRODUCT_ID,
      newValues: { noteId: 'n-new', authorName: 'Laura Pérez', text: 'Revisar garantía' },
    }));
  });

  it('si la cuenta no tiene nombre usa el del token y, si no, «Usuario»', async () => {
    const withToken = build();
    withToken.prisma.user.findUnique.mockResolvedValue(null);
    expect((await withToken.service.create(PRODUCT_ID, 'a', ME)).authorName).toBe('Nombre del token');

    const bare = build();
    bare.prisma.user.findUnique.mockResolvedValue(null);
    expect((await bare.service.create(PRODUCT_ID, 'a', { userId: 'user-1', roles: [] })).authorName).toBe('Usuario');
  });

  it.each([['vacío', ''], ['solo espacios', '   \n\t ']])('texto %s: 400 con código y no escribe', async (_label, text) => {
    const { service, prisma, audit } = build();
    const error = await catchError(service.create(PRODUCT_ID, text, ME));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.empty, message: 'Escribe el texto de la nota.' });
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
    expect(audit.logTx).not.toHaveBeenCalled();
  });

  it('texto demasiado largo: 400 con código; el límite exacto sí se acepta', async () => {
    const { service, prisma } = build();
    const error = await catchError(service.create(PRODUCT_ID, 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1), ME));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.tooLong });
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();

    await expect(service.create(PRODUCT_ID, 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH), ME)).resolves.toBeDefined();
  });

  it('producto inexistente: 404 y no escribe', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.create(PRODUCT_ID, 'hola', ME)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productInternalNote.create).not.toHaveBeenCalled();
  });
});

describe('ProductInternalNotesService · editar', () => {
  it('el autor edita: escribe con la versión vigente en el WHERE, sube la versión y audita antes/después', async () => {
    const { service, prisma, audit } = build();
    prisma.productInternalNote.findUniqueOrThrow.mockResolvedValue(
      noteRow({ text: 'Texto corregido', version: 1, updatedAt: new Date('2026-10-28T17:00:00Z') }),
    );

    const view = await service.update(PRODUCT_ID, 'n-1', '  Texto corregido ', 0, ME);

    expect(prisma.productInternalNote.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', productId: PRODUCT_ID, authorId: 'user-1', version: 0 },
      data: { text: 'Texto corregido', version: { increment: 1 } },
    });
    expect(view).toMatchObject({ id: 'n-1', text: 'Texto corregido', version: 1, canEdit: true, updatedAt: new Date('2026-10-28T17:00:00Z') });
    expect(audit.logTx).toHaveBeenCalledWith(prisma, expect.objectContaining({
      userId: 'user-1',
      action: 'update_internal_note',
      entity: 'Product',
      entityId: PRODUCT_ID,
      oldValues: { noteId: 'n-1', text: 'Proveedor confirmó stock para noviembre' },
      newValues: { noteId: 'n-1', text: 'Texto corregido' },
    }));
  });

  it('otra persona recibe 403 en español con código estable y la nota no se toca', async () => {
    const { service, prisma, audit } = build();
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'Intento ajeno', undefined, OTHER));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      code: INTERNAL_NOTE_ERRORS.notAuthor,
      message: 'Solo quien escribió la nota puede editarla.',
    });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
    expect(audit.logTx).not.toHaveBeenCalled();
  });

  it('ni Super Admin edita la nota de otra persona', async () => {
    const { service, prisma } = build(grantsOf([]));
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'Intento de admin', undefined, SUPER_ADMIN));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.notAuthor });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('una nota migrada (autor «Sistema», sin id) no la edita nadie', async () => {
    const { service, prisma } = build();
    prisma.productInternalNote.findFirst.mockResolvedValue(noteRow({ authorId: null, authorName: 'Sistema' }));
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'Reescribir', undefined, ME));
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.notAuthor });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('sin permiso se responde 403 de permisos antes de revelar si la nota existe', async () => {
    const { service, prisma } = build(grantsOf(['products:read']));
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'x', undefined, ME));
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.forbidden });
    expect(prisma.productInternalNote.findFirst).not.toHaveBeenCalled();
  });

  it('nota inexistente o de otro producto: 404 (se busca por id y producto)', async () => {
    const { service, prisma } = build();
    prisma.productInternalNote.findFirst.mockResolvedValue(null);
    const error = await catchError(service.update(PRODUCT_ID, 'n-x', 'hola', undefined, ME));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.notFound });
    expect(prisma.productInternalNote.findFirst).toHaveBeenCalledWith({ where: { id: 'n-x', productId: PRODUCT_ID } });
  });

  it('versión desactualizada (expectedVersion): 409 sin escribir', async () => {
    const { service, prisma } = build();
    prisma.productInternalNote.findFirst.mockResolvedValue(noteRow({ version: 3 }));
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'Texto nuevo', 1, ME));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.versionConflict, currentVersion: 3 });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('edición simultánea (otra pestaña ganó entre la lectura y la escritura): 409 y sin auditoría', async () => {
    const { service, prisma, audit } = build();
    prisma.productInternalNote.updateMany.mockResolvedValue({ count: 0 });
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'Texto nuevo', undefined, ME));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.versionConflict });
    expect(audit.logTx).not.toHaveBeenCalled();
  });

  it.each([['vacío', ''], ['solo espacios', '  ']])('texto %s: 400 y no escribe', async (_label, text) => {
    const { service, prisma } = build();
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', text, undefined, ME));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.empty });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('texto demasiado largo: 400 y no escribe', async () => {
    const { service, prisma } = build();
    const error = await catchError(service.update(PRODUCT_ID, 'n-1', 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1), undefined, ME));
    expect(error.getResponse()).toMatchObject({ code: INTERNAL_NOTE_ERRORS.tooLong });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
  });

  it('guardar el mismo texto no cambia versión ni historial', async () => {
    const { service, prisma, audit } = build();
    const view = await service.update(PRODUCT_ID, 'n-1', '  Proveedor confirmó stock para noviembre  ', 0, ME);
    expect(view).toMatchObject({ id: 'n-1', version: 0, updatedAt: null });
    expect(prisma.productInternalNote.updateMany).not.toHaveBeenCalled();
    expect(audit.logTx).not.toHaveBeenCalled();
  });
});

describe('ProductInternalNotesService · biblioteca dedicada', () => {
  it('en modo dedicado el historial va a la tabla de auditoría de biblioteca, con el nombre de la persona', async () => {
    const { service: _unused, prisma } = build();
    const library = {
      config: { mode: 'dedicated' },
      client: prisma,
      writeTransaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(prisma)),
    };
    const libraryAudit = { append: jest.fn().mockResolvedValue(null) };
    const audit = { logTx: jest.fn() };
    const dedicated = new ProductInternalNotesService(
      prisma as never, audit as never, grantsOf(FULL) as never, library as never, libraryAudit as never,
    );

    await dedicated.create(PRODUCT_ID, 'Nota en biblioteca dedicada', ME);

    expect(audit.logTx).not.toHaveBeenCalled();
    expect(libraryAudit.append).toHaveBeenCalledWith(prisma, expect.objectContaining({
      actor: { id: 'user-1', name: 'Laura Pérez' },
      action: 'PRODUCT_INTERNAL_NOTE_CREATED',
      entityType: 'Product',
      entityId: PRODUCT_ID,
      summary: { after: { noteId: 'n-new', authorName: 'Laura Pérez', text: 'Nota en biblioteca dedicada' } },
    }));
  });

  it('el constructor de compatibilidad (modo legacy) usa la fachada de biblioteca sobre Prisma', () => {
    const { prisma } = build();
    expect(directLegacyProductLibrary(prisma as never).config.mode).toBe('legacy');
  });
});
