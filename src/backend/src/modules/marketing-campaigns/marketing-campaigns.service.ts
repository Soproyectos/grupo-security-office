import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessContext } from '../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { hasGlobalGrant } from '../../common/security/require-grant';
import { AuditService } from '../audit/audit.service';
import type { CreateCampaignDto, PublishCampaignDto, UpdateCampaignDto } from './marketing-campaigns.dto';
import {
  CAMPAIGN_SLOTS,
  MAX_PUBLISHED,
  SLOTS_BY_KIND,
  assertImageDimensions,
  assertValidity,
  inspectImage,
  isCampaignContent,
  normalizeDate,
  normalizeLinkUrl,
  parseDataUrl,
  resolveFraming,
  stableStringify,
  toDataUrl,
  validityAt,
  type CampaignContent,
  type CampaignKind,
  type CampaignSlot,
  type CampaignValidity,
} from './marketing-campaigns.rules';

export const AUDIT_ENTITY = 'MarketingCampaign';
export const AUDIT_EVENTS = {
  create: 'marketing_campaign_create',
  edit: 'marketing_campaign_edit',
  publish: 'marketing_campaign_publish',
  unpublish: 'marketing_campaign_unpublish',
  delete: 'marketing_campaign_delete',
  imageUpload: 'marketing_campaign_image_upload',
  imageRemove: 'marketing_campaign_image_remove',
} as const;

const SLOT_FIELD: Record<CampaignSlot, 'imageDesktop' | 'imageMobile' | 'image'> = {
  desktop: 'imageDesktop',
  mobile: 'imageMobile',
  image: 'image',
};

const CONFLICT_MESSAGE = 'La campaña cambió mientras la editabas; recarga para ver la versión más reciente';

interface BannerRow {
  id: string;
  draft: unknown;
  publishedData: unknown;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Row of the metadata queries: JSON documents WITHOUT their base64 images. */
interface MetaRow {
  id: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  draft: unknown;
  published: unknown | null;
  hasImageDesktop: boolean;
  hasImageMobile: boolean;
  hasImage: boolean;
  samePublished: boolean;
}

interface PublicMetaRow {
  id: string;
  revision: number;
  createdAt: Date;
  content: unknown;
  hasImageDesktop: boolean;
  hasImageMobile: boolean;
  hasImage: boolean;
}

const IMAGE_FIELDS = ['imageDesktop', 'imageMobile', 'image'] as const;

function omitImages(content: CampaignContent): Omit<CampaignContent, 'imageDesktop' | 'imageMobile' | 'image'> {
  const { imageDesktop: _d, imageMobile: _m, image: _i, ...rest } = content;
  return rest;
}

/** Audit-safe snapshot: the metadata of a campaign, never the image bytes. */
function auditSnapshot(content: CampaignContent) {
  return { ...omitImages(content), hasImageDesktop: !!content.imageDesktop, hasImageMobile: !!content.imageMobile, hasImage: !!content.image };
}

@Injectable()
export class MarketingCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly grants?: AccessAssignmentsService,
  ) {}

  // ------------------------------------------------------------------ helpers

  private actor(ctx: AccessContext): string {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    return ctx.userId;
  }

  private contentOf(row: BannerRow | null): CampaignContent {
    if (!row || !isCampaignContent(row.draft)) throw new NotFoundException('Campaña no encontrada');
    return row.draft;
  }

  private publishedOf(row: BannerRow): CampaignContent | null {
    return isCampaignContent(row.publishedData) ? row.publishedData : null;
  }

  private assertSlot(kind: CampaignKind, slot: string): CampaignSlot {
    if (!(CAMPAIGN_SLOTS as readonly string[]).includes(slot) || !SLOTS_BY_KIND[kind].includes(slot as CampaignSlot)) {
      const allowed = SLOTS_BY_KIND[kind].join(', ');
      throw new BadRequestException(
        `Esta campaña es de tipo ${kind === 'HERO' ? 'banner del título' : 'pop-up'}; las imágenes admitidas son: ${allowed}`,
      );
    }
    return slot as CampaignSlot;
  }

  /** Optimistic write: only succeeds while the row still has the revision that was read. */
  private async commit(
    tx: Prisma.TransactionClient,
    row: BannerRow,
    data: { draft?: CampaignContent; publishedData?: CampaignContent | null },
  ): Promise<void> {
    const result = await tx.storefrontBanner.updateMany({
      where: { id: row.id, revision: row.revision },
      data: {
        ...(data.draft !== undefined && { draft: data.draft as unknown as Prisma.InputJsonValue }),
        ...(data.publishedData !== undefined && {
          publishedData: data.publishedData === null ? Prisma.DbNull : (data.publishedData as unknown as Prisma.InputJsonValue),
        }),
        revision: { increment: 1 },
      },
    });
    if (!result.count) throw new ConflictException(CONFLICT_MESSAGE);
  }

  private async loadRow(client: Pick<Prisma.TransactionClient, 'storefrontBanner'>, id: string): Promise<BannerRow> {
    const row = (await client.storefrontBanner.findUnique({ where: { id } })) as BannerRow | null;
    this.contentOf(row);
    return row as BannerRow;
  }

  describe(
    parts: {
      id: string;
      revision: number;
      createdAt: Date;
      updatedAt: Date;
      draft: Omit<CampaignContent, 'imageDesktop' | 'imageMobile' | 'image'>;
      published: Omit<CampaignContent, 'imageDesktop' | 'imageMobile' | 'image'> | null;
      hasImageDesktop: boolean;
      hasImageMobile: boolean;
      hasImage: boolean;
      samePublished: boolean;
    },
    now: Date,
  ) {
    const validity: CampaignValidity | null = parts.published ? validityAt(parts.published, now) : null;
    return {
      id: parts.id,
      revision: parts.revision,
      kind: parts.draft.kind,
      name: parts.draft.name,
      alt: parts.draft.alt,
      linkUrl: parts.draft.linkUrl ?? null,
      position: parts.draft.position,
      startsAt: parts.draft.startsAt ?? null,
      endsAt: parts.draft.endsAt ?? null,
      ...resolveFraming(parts.draft),
      hasImageDesktop: parts.hasImageDesktop,
      hasImageMobile: parts.hasImageMobile,
      hasImage: parts.hasImage,
      status: parts.published ? ('PUBLISHED' as const) : ('DRAFT' as const),
      hasPublished: !!parts.published,
      /** True only when a published copy exists and the draft was edited afterwards. */
      hasUnpublishedChanges: !!parts.published && !parts.samePublished,
      /** Validity of the PUBLISHED copy (null when not published). */
      validity,
      isLive: validity === 'ACTIVE',
      createdAt: parts.createdAt,
      updatedAt: parts.updatedAt,
    };
  }

  private describeRow(row: BannerRow, now: Date) {
    const draft = this.contentOf(row);
    const published = this.publishedOf(row);
    return this.describe(
      {
        id: row.id,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        draft: omitImages(draft),
        published: published ? omitImages(published) : null,
        hasImageDesktop: !!draft.imageDesktop,
        hasImageMobile: !!draft.imageMobile,
        hasImage: !!draft.image,
        samePublished: !!published && stableStringify(draft) === stableStringify(published),
      },
      now,
    );
  }

  private async assertCanEditDraft(ctx: AccessContext): Promise<void> {
    if ((await hasGlobalGrant(this.grants, 'marketing:create', ctx)) || (await hasGlobalGrant(this.grants, 'marketing:edit', ctx))) return;
    throw new ForbiddenException('Sin permiso marketing:create ni marketing:edit');
  }

  // -------------------------------------------------------------------- admin

  /** Metadata only: images are reduced to `has*` flags. Legacy rows without a campaign `kind` are ignored. */
  async list(now: Date = new Date()) {
    const rows = await this.prisma.$queryRaw<MetaRow[]>`
      SELECT "id", "revision", "createdAt", "updatedAt",
        ("draft" - 'imageDesktop' - 'imageMobile' - 'image') AS "draft",
        CASE WHEN "publishedData" IS NULL THEN NULL
             ELSE ("publishedData" - 'imageDesktop' - 'imageMobile' - 'image') END AS "published",
        ("draft"->>'imageDesktop') IS NOT NULL AS "hasImageDesktop",
        ("draft"->>'imageMobile') IS NOT NULL AS "hasImageMobile",
        ("draft"->>'image') IS NOT NULL AS "hasImage",
        ("publishedData" IS NOT NULL AND "publishedData" = "draft") AS "samePublished"
      FROM "storefront_banners"
      WHERE ("draft"->>'kind') IN ('HERO', 'POPUP')
      ORDER BY "createdAt" DESC, "id" ASC`;
    const items = rows
      .filter((row) => isCampaignContent(row.draft))
      .map((row) =>
        this.describe(
          {
            ...row,
            draft: row.draft as Omit<CampaignContent, 'imageDesktop' | 'imageMobile' | 'image'>,
            published: isCampaignContent(row.published)
              ? (row.published as Omit<CampaignContent, 'imageDesktop' | 'imageMobile' | 'image'>)
              : null,
          },
          now,
        ),
      );
    const kindOrder = (kind: CampaignKind) => (kind === 'HERO' ? 0 : 1);
    return items.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.position - b.position);
  }

  async get(id: string, now: Date = new Date()) {
    const row = await this.loadRow(this.prisma, id);
    return { ...this.describeRow(row, now), draft: this.contentOf(row) };
  }

  async create(dto: CreateCampaignDto, ctx: AccessContext) {
    const userId = this.actor(ctx);
    const startsAt = normalizeDate(dto.startsAt, 'inicio');
    const endsAt = normalizeDate(dto.endsAt, 'fin');
    assertValidity(startsAt, endsAt);
    const content: CampaignContent = {
      kind: dto.kind,
      name: dto.name,
      alt: dto.alt ?? '',
      linkUrl: normalizeLinkUrl(dto.linkUrl),
      position: dto.position ?? 0,
      startsAt,
      endsAt,
      fit: dto.fit ?? 'cover',
      focusX: dto.focusX ?? 50,
      focusY: dto.focusY ?? 50,
      ...(dto.fitMobile !== undefined && { fitMobile: dto.fitMobile }),
      ...(dto.focusMobileX !== undefined && { focusMobileX: dto.focusMobileX }),
      ...(dto.focusMobileY !== undefined && { focusMobileY: dto.focusMobileY }),
      imageDesktop: null,
      imageMobile: null,
      image: null,
    };
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.storefrontBanner.create({
        data: { id, draft: content as unknown as Prisma.InputJsonValue, revision: 0 },
      });
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.create,
        entity: AUDIT_ENTITY,
        entityId: id,
        newValues: auditSnapshot(content),
      });
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateCampaignDto, ctx: AccessContext) {
    const userId = this.actor(ctx);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, id);
      if (row.revision !== dto.revision) throw new ConflictException(CONFLICT_MESSAGE);
      const current = this.contentOf(row);
      const next: CampaignContent = { ...current };
      if (dto.name !== undefined) next.name = dto.name;
      if (dto.alt !== undefined) next.alt = dto.alt;
      if (dto.linkUrl !== undefined) next.linkUrl = normalizeLinkUrl(dto.linkUrl);
      if (dto.position !== undefined) next.position = dto.position;
      if (dto.startsAt !== undefined) next.startsAt = normalizeDate(dto.startsAt, 'inicio');
      if (dto.endsAt !== undefined) next.endsAt = normalizeDate(dto.endsAt, 'fin');
      if (dto.fit !== undefined) next.fit = dto.fit;
      if (dto.focusX !== undefined) next.focusX = dto.focusX;
      if (dto.focusY !== undefined) next.focusY = dto.focusY;
      // Mobile values equal to what the draft already resolves to (saved or inherited) are not a change.
      const framing = resolveFraming(current);
      if (dto.fitMobile !== undefined && dto.fitMobile !== framing.fitMobile) next.fitMobile = dto.fitMobile;
      if (dto.focusMobileX !== undefined && dto.focusMobileX !== framing.focusMobileX) next.focusMobileX = dto.focusMobileX;
      if (dto.focusMobileY !== undefined && dto.focusMobileY !== framing.focusMobileY) next.focusMobileY = dto.focusMobileY;
      assertValidity(next.startsAt, next.endsAt);
      const changed = (Object.keys(next) as Array<keyof CampaignContent>).filter(
        (key) => !IMAGE_FIELDS.includes(key as (typeof IMAGE_FIELDS)[number]) && next[key] !== current[key],
      );
      if (!changed.length) return;
      await this.commit(tx, row, { draft: next });
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.edit,
        entity: AUDIT_ENTITY,
        entityId: id,
        oldValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
        newValues: Object.fromEntries(changed.map((key) => [key, next[key]])),
      });
    });
    return this.get(id);
  }

  async setImage(
    id: string,
    slotParam: string,
    file: { buffer: Buffer } | undefined,
    ctx: AccessContext,
  ) {
    const userId = this.actor(ctx);
    await this.assertCanEditDraft(ctx);
    if (!file) throw new BadRequestException('Selecciona una imagen');
    // Validates before touching the database: real signature, 3 MB and the size expected for the slot.
    const image = inspectImage(file.buffer);
    const preliminary = (CAMPAIGN_SLOTS as readonly string[]).includes(slotParam) ? (slotParam as CampaignSlot) : null;
    if (!preliminary) throw new BadRequestException('Espacio de imagen no válido: usa desktop, mobile o image');
    assertImageDimensions(image, preliminary);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, id);
      const current = this.contentOf(row);
      const slot = this.assertSlot(current.kind, slotParam);
      const next: CampaignContent = { ...current, [SLOT_FIELD[slot]]: toDataUrl(file.buffer, image.mime) };
      await this.commit(tx, row, { draft: next });
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.imageUpload,
        entity: AUDIT_ENTITY,
        entityId: id,
        newValues: { slot, mime: image.mime, width: image.width, height: image.height, bytes: image.bytes },
      });
    });
    return this.get(id);
  }

  async removeImage(id: string, slotParam: string, ctx: AccessContext) {
    const userId = this.actor(ctx);
    await this.assertCanEditDraft(ctx);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, id);
      const current = this.contentOf(row);
      const slot = this.assertSlot(current.kind, slotParam);
      if (!current[SLOT_FIELD[slot]]) return;
      const next: CampaignContent = { ...current, [SLOT_FIELD[slot]]: null };
      await this.commit(tx, row, { draft: next });
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.imageRemove,
        entity: AUDIT_ENTITY,
        entityId: id,
        newValues: { slot, removed: true },
      });
    });
    return this.get(id);
  }

  async publish(id: string, dto: PublishCampaignDto | undefined, ctx: AccessContext, now: Date = new Date()) {
    const userId = this.actor(ctx);
    await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent publications so the per-kind limit cannot be exceeded by a race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('marketing_campaigns_publish'))`;
      const row = await this.loadRow(tx, id);
      if (dto?.revision !== undefined && dto.revision !== row.revision) throw new ConflictException(CONFLICT_MESSAGE);
      const content = this.contentOf(row);
      if (!content.name.trim()) throw new BadRequestException('Falta el nombre de la campaña');
      if (!content.alt.trim()) throw new BadRequestException('Escribe el texto alternativo de la imagen antes de publicar');
      if (content.kind === 'HERO' && !content.imageDesktop) {
        throw new BadRequestException('Sube la imagen de escritorio del banner antes de publicar');
      }
      if (content.kind === 'POPUP' && !content.image) {
        throw new BadRequestException('Sube la imagen del pop-up antes de publicar');
      }
      assertValidity(content.startsAt, content.endsAt);
      if (validityAt(content, now) === 'EXPIRED') {
        throw new BadRequestException('La vigencia ya venció; edita las fechas antes de publicar');
      }
      const others = await tx.$queryRaw<Array<{ id: string; endsAt: string | null }>>`
        SELECT "id", ("publishedData"->>'endsAt') AS "endsAt"
        FROM "storefront_banners"
        WHERE "publishedData" IS NOT NULL
          AND ("publishedData"->>'kind') = ${content.kind}
          AND "id" <> ${id}`;
      // A published campaign whose window already ended no longer takes a place.
      const occupied = others.filter((other) => validityAt({ startsAt: null, endsAt: other.endsAt }, now) !== 'EXPIRED').length;
      if (occupied >= MAX_PUBLISHED[content.kind]) {
        throw new ConflictException(
          content.kind === 'HERO'
            ? `Ya hay ${MAX_PUBLISHED.HERO} banners del título publicados; retira uno antes de publicar otro`
            : 'Ya hay un pop-up publicado; retíralo antes de publicar otro',
        );
      }
      const previous = this.publishedOf(row);
      await this.commit(tx, row, { publishedData: content });
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.publish,
        entity: AUDIT_ENTITY,
        entityId: id,
        oldValues: { published: !!previous },
        newValues: { published: true, revision: row.revision + 1, ...auditSnapshot(content) },
      });
    });
    return this.get(id, now);
  }

  async unpublish(id: string, ctx: AccessContext) {
    const userId = this.actor(ctx);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, id);
      if (!this.publishedOf(row)) throw new ConflictException('La campaña no está publicada');
      await this.commit(tx, row, { publishedData: null });
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.unpublish,
        entity: AUDIT_ENTITY,
        entityId: id,
        oldValues: { published: true },
        newValues: { published: false, revision: row.revision + 1 },
      });
    });
    return this.get(id);
  }

  async remove(id: string, ctx: AccessContext) {
    const userId = this.actor(ctx);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, id);
      if (row.publishedData !== null && row.publishedData !== undefined) {
        throw new ConflictException('La campaña está publicada; retírala antes de eliminarla');
      }
      const result = await tx.storefrontBanner.deleteMany({ where: { id, revision: row.revision } });
      if (!result.count) throw new ConflictException(CONFLICT_MESSAGE);
      await this.audit.logTx(tx, {
        userId,
        action: AUDIT_EVENTS.delete,
        entity: AUDIT_ENTITY,
        entityId: id,
        oldValues: auditSnapshot(this.contentOf(row)),
      });
    });
    return { id, deleted: true };
  }

  // ------------------------------------------------------------------- public

  /**
   * What the storefront shows right now: ONLY the published copy, inside its
   * validity window. Reads no draft and no image bytes (images are served by
   * {@link publicImage}); the image URLs carry `?v=<revision>` to refresh caches.
   */
  async listPublic(now: Date = new Date()) {
    const rows = await this.prisma.$queryRaw<PublicMetaRow[]>`
      SELECT "id", "revision", "createdAt",
        ("publishedData" - 'imageDesktop' - 'imageMobile' - 'image') AS "content",
        ("publishedData"->>'imageDesktop') IS NOT NULL AS "hasImageDesktop",
        ("publishedData"->>'imageMobile') IS NOT NULL AS "hasImageMobile",
        ("publishedData"->>'image') IS NOT NULL AS "hasImage"
      FROM "storefront_banners"
      WHERE "publishedData" IS NOT NULL
        AND ("publishedData"->>'kind') IN ('HERO', 'POPUP')`;
    const live = rows
      .filter((row) => isCampaignContent(row.content) && validityAt(row.content, now) === 'ACTIVE')
      .map((row) => ({ row, content: row.content as CampaignContent }));
    const url = (row: PublicMetaRow, slot: CampaignSlot) => `/api/storefront/campaigns/${row.id}/image/${slot}?v=${row.revision}`;

    const hero = live
      .filter(({ content, row }) => content.kind === 'HERO' && row.hasImageDesktop)
      .sort((a, b) => a.content.position - b.content.position || +new Date(a.row.createdAt) - +new Date(b.row.createdAt) || (a.row.id < b.row.id ? -1 : 1))
      .slice(0, MAX_PUBLISHED.HERO)
      .map(({ row, content }) => ({
        id: row.id,
        revision: row.revision,
        alt: content.alt,
        linkUrl: content.linkUrl ?? null,
        ...resolveFraming(content),
        imageDesktopUrl: url(row, 'desktop'),
        imageMobileUrl: row.hasImageMobile ? url(row, 'mobile') : null,
      }));

    const popupRow = live
      .filter(({ content, row }) => content.kind === 'POPUP' && row.hasImage)
      .sort((a, b) => +new Date(a.row.createdAt) - +new Date(b.row.createdAt) || (a.row.id < b.row.id ? -1 : 1))[0];
    const popup = popupRow
      ? {
          id: popupRow.row.id,
          revision: popupRow.row.revision,
          alt: popupRow.content.alt,
          linkUrl: popupRow.content.linkUrl ?? null,
          imageUrl: url(popupRow.row, 'image'),
        }
      : null;

    return { hero, popup };
  }

  /** Binary of the PUBLISHED copy of one slot. 404 when the campaign is not published, expired or not yet started. */
  async publicImage(id: string, slotParam: string, now: Date = new Date()) {
    const notFound = () => new NotFoundException('Imagen no encontrada');
    if (!(CAMPAIGN_SLOTS as readonly string[]).includes(slotParam)) throw notFound();
    const slot = slotParam as CampaignSlot;
    const field = SLOT_FIELD[slot];
    const rows = await this.prisma.$queryRaw<Array<{ revision: number; content: unknown; dataUrl: string | null }>>`
      SELECT "revision",
        ("publishedData" - 'imageDesktop' - 'imageMobile' - 'image') AS "content",
        ("publishedData"->>${field}::text) AS "dataUrl"
      FROM "storefront_banners"
      WHERE "id" = ${id} AND "publishedData" IS NOT NULL`;
    const row = rows[0];
    if (!row || !isCampaignContent(row.content) || validityAt(row.content, now) !== 'ACTIVE') throw notFound();
    if (!SLOTS_BY_KIND[row.content.kind].includes(slot)) throw notFound();
    const parsed = parseDataUrl(row.dataUrl);
    if (!parsed) throw notFound();
    return { buffer: parsed.buffer, mime: parsed.mime, etag: `"${id}-${row.revision}-${slot}"` };
  }
}
