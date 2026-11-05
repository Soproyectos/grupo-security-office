import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService, type LibraryActor } from '../library-audit/library-audit.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { buildUsageReport, findNameCollision, nameTaken } from '../masters/master-rules';
import { FilesService, FILES_URL_PREFIX } from '../files/files.service';

const ALLOWED_BRAND_IMAGE_MIMETYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_BRAND_IMAGE_SIZE = 8 * 1024 * 1024; // 8 MB

@Injectable()
export class BrandsService {
  constructor(
    private readonly library: BibliotecaPrismaService,
    private files: FilesService,
    private readonly audit: LibraryAuditService,
  ) { }

  private get prisma() { return this.library.client; }

  async findAll() {
    const brands = await this.prisma.brand.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      data: brands.map((b) => ({
        ...b,
        productCount: b._count.products,
      })),
    };
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: {
        products: { select: { id: true, name: true, sku: true } },
        _count: { select: { products: true } },
      },
    });

    if (!brand) throw new NotFoundException('Marca no encontrada');
    return brand;
  }

  async create(dto: CreateBrandDto, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
      const existingName = await tx.brand.findUnique({ where: { name: dto.name } });
      if (existingName) throw new ConflictException('Ya existe una marca con ese nombre');

      const existingSlug = await tx.brand.findUnique({ where: { slug: dto.slug } });
      if (existingSlug) throw new ConflictException('Ya existe una marca con ese slug');
      await this.assertNameFree(tx, dto.name);

      const result = await tx.brand.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          logo: dto.logo,
          description: dto.description,
          website: dto.website,
          isActive: dto.isActive ?? true,
        },
      });

      await this.audit.append(tx, { actor, action: 'BRAND_CREATED', entityType: 'Brand', entityId: result.id, summary: { fields: Object.keys(dto) } });
      return result;
    });
  }

  async update(id: string, dto: UpdateBrandDto, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM brands WHERE id=${id} FOR UPDATE`;
      const brand = await tx.brand.findUnique({ where: { id } });
      if (!brand) throw new NotFoundException('Marca no encontrada');

      if (dto.name && dto.name !== brand.name) {
        const existing = await tx.brand.findUnique({ where: { name: dto.name } });
        if (existing) throw new ConflictException('Ya existe una marca con ese nombre');
      }
      if (dto.name) await this.assertNameFree(tx, dto.name, id);

      if (dto.slug && dto.slug !== brand.slug) {
        const existing = await tx.brand.findUnique({ where: { slug: dto.slug } });
        if (existing) throw new ConflictException('Ya existe una marca con ese slug');
      }

      const result = await tx.brand.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dto.slug && { slug: dto.slug }),
          ...(dto.logo !== undefined && { logo: dto.logo }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.website !== undefined && { website: dto.website }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      await this.audit.append(tx, { actor, action: 'BRAND_UPDATED', entityType: 'Brand', entityId: id, summary: { fields: Object.keys(dto) } });
      return result;
    });
  }

  /** Dependencies of a brand and whether it can be deleted. */
  async usage(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id }, select: { id: true } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    const products = await this.prisma.product.count({ where: { brandId: id } });
    return buildUsageReport(id, { products }, [
      { key: 'products', code: 'HAS_PRODUCTS', message: (n) => `tiene ${n} producto(s)` },
    ]);
  }

  /** 409 when another brand has an equivalent name (case/accent-insensitive). */
  private async assertNameFree(tx: { brand: { findMany: Function } }, name: string, selfId?: string) {
    const rows = (await tx.brand.findMany({ select: { id: true, name: true } })) as { id: string; name: string }[];
    const clash = findNameCollision(name, rows, selfId);
    if (clash) throw nameTaken('una marca', clash);
  }

  async toggleActive(id: string, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM brands WHERE id=${id} FOR UPDATE`;
      const brand = await tx.brand.findUnique({ where: { id } });
      if (!brand) throw new NotFoundException('Marca no encontrada');

      const result = await tx.brand.update({
        where: { id },
        data: { isActive: !brand.isActive },
      });

      await this.audit.append(tx, { actor, action: 'BRAND_ACTIVE_CHANGED', entityType: 'Brand', entityId: id, summary: { fields: [] } });
      return result;
    });
  }

  /**
   * Sube el logo de una marca: valida mimetype (png/jpeg/webp) y tamaño
   * máximo (8 MB), guarda los bytes en BD y borra el logo anterior si era
   * un upload interno (gestionado por este mismo almacén).
   */
  private validateLogo(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Archivo requerido en el campo "file"');
    }

    if (!ALLOWED_BRAND_IMAGE_MIMETYPES[file.mimetype]) {
      throw new BadRequestException('Tipo de archivo no permitido. Use PNG, JPEG o WEBP.');
    }

    if (file.size > MAX_BRAND_IMAGE_SIZE) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 8MB');
    }
  }

  async uploadLogo(id: string, file: Express.Multer.File, actor?: LibraryActor) {
    this.library.assertWritesAllowed();
    if (this.library.config.mode === 'dedicated') return this.library.writeTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM brands WHERE id=${id} FOR UPDATE`;
      const brand = await tx.brand.findUnique({ where: { id } });
      if (!brand) throw new NotFoundException('Marca no encontrada');

      this.validateLogo(file);

      const { url } = await this.files.store(file.buffer, file.mimetype, { tx, actor });


      const result = await tx.brand.update({
        where: { id },
        data: { logo: url },
      });

      if (brand.logo?.startsWith(FILES_URL_PREFIX)) await this.files.release(brand.logo, { tx, userId: actor?.id, actorName: actor?.name });
      await this.audit.append(tx, { actor, action: 'BRAND_LOGO_UPDATED', entityType: 'Brand', entityId: id, summary: { logo: result.logo } });
      return result;

    });

    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marca no encontrada');

    this.validateLogo(file);

    const { url } = await this.files.store(file.buffer, file.mimetype);

    if (brand.logo?.startsWith(FILES_URL_PREFIX)) {
      await this.files.deleteByUrl(brand.logo);
    }

    return this.prisma.brand.update({
      where: { id },
      data: { logo: url },
    });

  }

  async remove(id: string, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM brands WHERE id=${id} FOR UPDATE`;
      const brand = await tx.brand.findUnique({
        where: { id },
        include: { products: true },
      });

      if (!brand) throw new NotFoundException('Marca no encontrada');
      if (brand.products.length > 0) {
        throw new ConflictException('No se puede eliminar una marca con productos');
      }

      await tx.brand.delete({ where: { id } });
      const result = { message: 'Marca eliminada exitosamente' };

      await this.audit.append(tx, { actor, action: 'BRAND_DELETED', entityType: 'Brand', entityId: id, summary: { fields: [] } });
      return result;
    });
  }
}
