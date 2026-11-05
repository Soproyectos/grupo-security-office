import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../../../prisma/biblioteca/generated/client';
import type { AccessContext } from '../../common/acl/acl.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../library-audit/library-audit.service';
import { RecordEvidenceDto, RecordGapDto } from './library-review.dto';

export type ReviewContext = AccessContext & { name?: string };
export const LIBRARY_PRODUCT_ACCESS = Symbol('LIBRARY_PRODUCT_ACCESS');
export interface LibraryProductAccess {
  assertProductAccess(id: string, ctx: AccessContext, level: string): Promise<{ listaId: string | null }>;
}
const DOCUMENT_KEYS = new Set(['datasheet', 'manual', 'firmware']);

@Injectable()
export class LibraryReviewService {
  constructor(
    private readonly library: BibliotecaPrismaService,
    @Inject(LIBRARY_PRODUCT_ACCESS) private readonly acl: LibraryProductAccess,
    private readonly audit: LibraryAuditService,
  ) {}

  private dedicated() {
    if (this.library.config.mode !== 'dedicated') throw new ServiceUnavailableException({
      code: 'LIBRARY_REVIEW_UNAVAILABLE', message: 'La revisión de biblioteca aún no está habilitada en este entorno.',
    });
  }

  async review(productId: string, ctx: ReviewContext) {
    this.dedicated();
    await this.acl.assertProductAccess(productId, ctx, 'view');
    const [gaps, evidence] = await Promise.all([
      this.library.client.productGap.findMany({ where: { productId }, orderBy: { detectedAt: 'desc' } }),
      this.library.client.fieldEvidence.findMany({ where: { productId }, orderBy: { fieldKey: 'asc' } }),
    ]);
    // Supplier costs are deliberately absent from this read contract.
    return { productId, gaps, evidence };
  }

  private async lockProduct(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE id=${productId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Producto no encontrado');
  }

  async recordGap(productId: string, input: RecordGapDto, ctx: ReviewContext) {
    this.dedicated();
    await this.acl.assertProductAccess(productId, ctx, 'edit_products');
    const gapKey = input.gapKey.trim();
    const reason = input.reason?.trim() || null;
    if (!gapKey || (input.expectedOpenId !== null && !input.expectedOpenId?.trim())) throw new BadRequestException('Se requiere dato y versión del faltante');
    if (DOCUMENT_KEYS.has(gapKey) && input.severity !== 'AVISO') throw new BadRequestException('Los documentos faltantes son avisos');
    if (input.status === 'NO_APLICA' && !reason) throw new BadRequestException('No aplica requiere un motivo explícito');
    return this.library.writeTransaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const previous = await tx.productGap.findFirst({ where: { productId, gapKey, resolvedAt: null } });
      if ((previous?.id ?? null) !== input.expectedOpenId) throw new ConflictException('El faltante cambió; vuelve a revisarlo');
      if (previous) await tx.productGap.update({ where: { id: previous.id }, data: { resolvedAt: new Date() } });
      const gap = await tx.productGap.create({ data: {
        productId, gapKey, status: input.status, severity: input.severity, reason,
        setByActorId: ctx.userId, setByActorName: ctx.name,
      } });
      await this.audit.append(tx, { actor: { id: ctx.userId, name: ctx.name }, action: 'PRODUCT_GAP_RECORDED', entityType: 'Product', entityId: productId,
        summary: { gapKey, previousId: previous?.id ?? null, gapId: gap.id, status: gap.status, severity: gap.severity } });
      return gap;
    });
  }

  async resolveGap(productId: string, gapId: string, ctx: ReviewContext) {
    this.dedicated();
    await this.acl.assertProductAccess(productId, ctx, 'edit_products');
    return this.library.writeTransaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const gap = await tx.productGap.findFirst({ where: { id: gapId, productId, resolvedAt: null } });
      if (!gap) throw new ConflictException('El faltante cambió; vuelve a revisarlo');
      const resolved = await tx.productGap.update({ where: { id: gapId }, data: { resolvedAt: new Date() } });
      await this.audit.append(tx, { actor: { id: ctx.userId, name: ctx.name }, action: 'PRODUCT_GAP_RESOLVED', entityType: 'Product', entityId: productId,
        summary: { gapId, gapKey: gap.gapKey } });
      return resolved;
    });
  }

  async recordEvidence(productId: string, input: RecordEvidenceDto, ctx: ReviewContext) {
    this.dedicated();
    await this.acl.assertProductAccess(productId, ctx, 'edit_products');
    const fieldKey = input.fieldKey.trim();
    const reason = input.reason?.trim() || null;
    const sourceUrl = input.sourceUrl?.trim() || null;
    if (!fieldKey || (input.expectedId !== null && !input.expectedId?.trim())) throw new BadRequestException('Se requiere dato y versión de la evidencia');
    if (sourceUrl) {
      let url: URL;
      try { url = new URL(sourceUrl); } catch { throw new BadRequestException('URL de fuente inválida'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('URL de fuente inválida');
    }
    if (input.level === 'VERIFICADO' && input.sourceKind === 'FABRICANTE' && !sourceUrl) throw new BadRequestException('La verificación del fabricante requiere fuente');
    if (input.level === 'INFERIDO' && !reason) throw new BadRequestException('La inferencia requiere motivo');
    return this.library.writeTransaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const previous = await tx.fieldEvidence.findUnique({ where: { productId_fieldKey: { productId, fieldKey } } });
      if ((previous?.id ?? null) !== input.expectedId) throw new ConflictException('La evidencia cambió; vuelve a revisarla');
      // A new id is the comparison token; the prior source remains in the audit event.
      if (previous) await tx.fieldEvidence.delete({ where: { id: previous.id } });
      const evidence = await tx.fieldEvidence.create({ data: {
        productId, fieldKey, level: input.level, sourceKind: input.sourceKind,
        sourceUrl: sourceUrl ?? previous?.sourceUrl ?? null,
        reason: reason ?? previous?.reason ?? null,
        valueHash: input.valueHash?.trim() || previous?.valueHash || null, actorId: ctx.userId, actorName: ctx.name,
      } });
      const snapshot = (value: typeof evidence) => ({ id: value.id, level: value.level, sourceKind: value.sourceKind,
        sourceUrl: value.sourceUrl, reason: value.reason, valueHash: value.valueHash });
      await this.audit.append(tx, { actor: { id: ctx.userId, name: ctx.name }, action: 'PRODUCT_EVIDENCE_RECORDED', entityType: 'Product', entityId: productId,
        summary: { fieldKey, before: previous ? snapshot(previous) : null, after: snapshot(evidence) } });
      return evidence;
    });
  }
}
