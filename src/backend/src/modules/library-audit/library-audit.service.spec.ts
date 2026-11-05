import { LibraryAuditService } from './library-audit.service';
import type { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import type { Prisma } from '../../../prisma/biblioteca/generated/client';

describe('library audit transaction ownership', () => {
  const event = { action: 'CATEGORY_CREATED', entityType: 'Category', entityId: 'synthetic-category',
    actor: { id: 'synthetic-actor', name: 'Persona sintética' }, summary: { fields: ['name'] } };

  it('writes through the exact supplied library transaction with external actor snapshot', async () => {
    const library = { config: { mode: 'dedicated' } } as BibliotecaPrismaService;
    const create = jest.fn().mockResolvedValue({ id: 'synthetic-event' });
    const tx = { libraryAuditEvent: { create } } as unknown as Pick<Prisma.TransactionClient, 'libraryAuditEvent'>;
    await expect(new LibraryAuditService(library).append(tx, event)).resolves.toEqual({ id: 'synthetic-event' });
    expect(create).toHaveBeenCalledWith({ data: {
      actorId: 'synthetic-actor', actorName: 'Persona sintética', action: 'CATEGORY_CREATED',
      entityType: 'Category', entityId: 'synthetic-category', summary: { fields: ['name'] }, requestId: null,
    } });
  });

  it('propagates an audit failure so the enclosing data transaction can roll back', async () => {
    const library = { config: { mode: 'dedicated' } } as BibliotecaPrismaService;
    const create = jest.fn().mockRejectedValue(new Error('synthetic audit failure'));
    const tx = { libraryAuditEvent: { create } } as unknown as Pick<Prisma.TransactionClient, 'libraryAuditEvent'>;
    await expect(new LibraryAuditService(library).append(tx, event)).rejects.toThrow('synthetic audit failure');
  });

  it('does not write a library table or move historical AuditLog in legacy mode', async () => {
    const library = { config: { mode: 'legacy' } } as BibliotecaPrismaService;
    const create = jest.fn();
    const tx = { libraryAuditEvent: { create } } as unknown as Pick<Prisma.TransactionClient, 'libraryAuditEvent'>;
    await expect(new LibraryAuditService(library).append(tx, event)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
