import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';

export interface LibraryActor {
  id?: string | null;
  name?: string | null;
}

export interface LibraryEvent {
  actor?: LibraryActor;
  action: string;
  entityType: string;
  entityId: string;
  /** Explicit domain metadata; never pass an HTTP request, credentials or file bytes. */
  summary: Prisma.InputJsonObject;
  requestId?: string;
}

@Injectable()
export class LibraryAuditService {
  constructor(private readonly library: BibliotecaPrismaService) {}

  /** Caller supplies its data transaction: event and mutation commit or roll back together. */
  async append(tx: Pick<Prisma.TransactionClient, 'libraryAuditEvent'>, event: LibraryEvent) {
    // Existing legacy behavior is unchanged; this service never moves historical AuditLog.
    if (this.library.config.mode === 'legacy') return null;
    return tx.libraryAuditEvent.create({
      data: {
        actorId: event.actor?.id?.trim() || null,
        actorName: event.actor?.name?.trim() || null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        summary: event.summary,
        requestId: event.requestId ?? null,
      },
    });
  }
}
