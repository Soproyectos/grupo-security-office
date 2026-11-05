import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Prisma as LibraryPrisma } from '../../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessContext } from '../../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { hasGlobalGrant } from '../../../common/security/require-grant';
import { AuditService } from '../../audit/audit.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { directLegacyProductLibrary } from '../product-library';
import { INTERNAL_NOTE_MAX_LENGTH, InternalNoteView } from './dto/internal-note.dto';

/** Stable error codes (the screen can branch on them; the message is shown as is). */
export const INTERNAL_NOTE_ERRORS = {
  forbidden: 'INTERNAL_NOTES_FORBIDDEN',
  productNotFound: 'INTERNAL_NOTE_PRODUCT_NOT_FOUND',
  notFound: 'INTERNAL_NOTE_NOT_FOUND',
  notAuthor: 'INTERNAL_NOTE_NOT_AUTHOR',
  empty: 'INTERNAL_NOTE_EMPTY',
  tooLong: 'INTERNAL_NOTE_TOO_LONG',
  versionConflict: 'INTERNAL_NOTE_VERSION_CONFLICT',
} as const;

type NoteRow = {
  id: string;
  authorId: string | null;
  authorName: string;
  text: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Internal (private) notes of a product, one row per note. Authorized only by panel grants:
 * `products:write` + `products:notes` (global), the same pair the audit history asks for.
 * Anyone with both grants sees every note; only the author can edit his own note — no role,
 * not even Super Admin, edits somebody else's note. There is no delete.
 */
@Injectable()
export class ProductInternalNotesService {
  constructor(
    private readonly legacy: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly grants?: AccessAssignmentsService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(legacy),
    @Inject(LibraryAuditService) private readonly libraryAudit: LibraryAuditService = new LibraryAuditService(library),
  ) {}

  private get prisma() { return this.library.client; }

  /** Server-side permission check; the controller guard checks the same pair first. */
  private async assertAccess(ctx: AccessContext): Promise<void> {
    const write = await hasGlobalGrant(this.grants, 'products:write', ctx);
    const notes = write && await hasGlobalGrant(this.grants, 'products:notes', ctx);
    if (!write || !notes) {
      throw new ForbiddenException({
        code: INTERNAL_NOTE_ERRORS.forbidden,
        message: 'No tienes acceso a las notas internas.',
      });
    }
  }

  private async assertProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      throw new NotFoundException({ code: INTERNAL_NOTE_ERRORS.productNotFound, message: 'Producto no encontrado.' });
    }
  }

  private cleanText(raw: string): string {
    const text = (raw ?? '').trim();
    if (!text) {
      throw new BadRequestException({ code: INTERNAL_NOTE_ERRORS.empty, message: 'Escribe el texto de la nota.' });
    }
    if (text.length > INTERNAL_NOTE_MAX_LENGTH) {
      throw new BadRequestException({
        code: INTERNAL_NOTE_ERRORS.tooLong,
        message: `La nota no puede superar ${INTERNAL_NOTE_MAX_LENGTH} caracteres.`,
      });
    }
    return text;
  }

  /** Author name is frozen on the note; the account row is the source, the token name the fallback. */
  private async authorName(ctx: AccessContext): Promise<string> {
    if (ctx.userId) {
      const user = await this.legacy.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
      if (user?.name?.trim()) return user.name.trim();
    }
    return ctx.userName?.trim() || 'Usuario';
  }

  private toView(note: NoteRow, ctx: AccessContext): InternalNoteView {
    return {
      id: note.id,
      text: note.text,
      authorName: note.authorName,
      createdAt: note.createdAt,
      updatedAt: note.version > 0 ? note.updatedAt : null,
      canEdit: !!ctx.userId && note.authorId === ctx.userId,
      version: note.version,
    };
  }

  async list(productId: string, ctx: AccessContext): Promise<InternalNoteView[]> {
    await this.assertAccess(ctx);
    await this.assertProduct(productId);
    const rows = await this.prisma.productInternalNote.findMany({
      where: { productId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toView(row, ctx));
  }

  async create(productId: string, text: string, ctx: AccessContext): Promise<InternalNoteView> {
    await this.assertAccess(ctx);
    const clean = this.cleanText(text);
    await this.assertProduct(productId);
    const authorName = await this.authorName(ctx);

    const row = await this.library.writeTransaction(async (tx) => {
      const created = await tx.productInternalNote.create({
        data: { productId, authorId: ctx.userId ?? null, authorName, text: clean },
      });
      await this.record(tx, 'create_internal_note', 'PRODUCT_INTERNAL_NOTE_CREATED', productId, ctx, authorName, {
        after: { noteId: created.id, authorName, text: clean },
      });
      return created;
    });
    return this.toView(row, ctx);
  }

  async update(
    productId: string,
    noteId: string,
    text: string,
    expectedVersion: number | undefined,
    ctx: AccessContext,
  ): Promise<InternalNoteView> {
    await this.assertAccess(ctx);
    const clean = this.cleanText(text);
    const note = await this.prisma.productInternalNote.findFirst({ where: { id: noteId, productId } });
    if (!note) {
      throw new NotFoundException({ code: INTERNAL_NOTE_ERRORS.notFound, message: 'La nota no existe.' });
    }
    // Only the author edits. Notes migrated from the old text (no author id) belong to nobody.
    if (!ctx.userId || note.authorId !== ctx.userId) {
      throw new ForbiddenException({
        code: INTERNAL_NOTE_ERRORS.notAuthor,
        message: 'Solo quien escribió la nota puede editarla.',
      });
    }
    if (expectedVersion !== undefined && expectedVersion !== note.version) throw this.versionConflict(note.version);
    if (clean === note.text) return this.toView(note, ctx);

    const row = await this.library.writeTransaction(async (tx) => {
      // The version in the WHERE makes the write atomic: a concurrent edit makes it match nothing.
      const result = await tx.productInternalNote.updateMany({
        where: { id: noteId, productId, authorId: ctx.userId, version: note.version },
        data: { text: clean, version: { increment: 1 } },
      });
      if (result.count !== 1) throw this.versionConflict(note.version);
      await this.record(tx, 'update_internal_note', 'PRODUCT_INTERNAL_NOTE_UPDATED', productId, ctx, note.authorName, {
        before: { noteId, text: note.text },
        after: { noteId, text: clean },
      });
      return tx.productInternalNote.findUniqueOrThrow({ where: { id: noteId } });
    });
    return this.toView(row, ctx);
  }

  private versionConflict(currentVersion: number): ConflictException {
    return new ConflictException({
      code: INTERNAL_NOTE_ERRORS.versionConflict,
      message: 'La nota cambió mientras la editabas. Recarga las notas antes de volver a guardar.',
      currentVersion,
    });
  }

  /**
   * History entry on the product, written in the same transaction as the note.
   * Legacy mode uses the operational audit log; the dedicated library uses its own audit table.
   */
  private async record(
    tx: LibraryPrisma.TransactionClient,
    legacyAction: string,
    libraryAction: string,
    productId: string,
    ctx: AccessContext,
    actorName: string,
    values: { before?: Record<string, unknown>; after: Record<string, unknown> },
  ): Promise<void> {
    if (this.library.config.mode === 'legacy') {
      await this.audit.logTx(tx as unknown as Prisma.TransactionClient, {
        userId: ctx.userId,
        action: legacyAction,
        entity: 'Product',
        entityId: productId,
        productId,
        oldValues: values.before,
        newValues: values.after,
      });
      return;
    }
    await this.libraryAudit.append(tx, {
      actor: { id: ctx.userId, name: actorName },
      action: libraryAction,
      entityType: 'Product',
      entityId: productId,
      summary: { ...(values.before ? { before: values.before } : {}), after: values.after } as LibraryPrisma.InputJsonObject,
    });
  }
}
