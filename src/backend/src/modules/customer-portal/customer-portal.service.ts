import { AssignPortalTierDto, PortalTierDto } from './dto/portal-tier.dto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PortalAccountState, PortalAccountType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { RegisterPortalAccountDto } from './dto/register-portal-account.dto';
import { ApprovePortalAccountDto, RejectPortalAccountDto } from './dto/review-portal-account.dto';
import { UpsertPortalPriceListMappingDto } from './dto/upsert-price-list-mapping.dto';

const GENERIC_LOGIN_ERROR = 'Credenciales inválidas';
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7ROU8.4uWxTPoqkbnk1k1ZfMCTPQmPu';

@Injectable()
export class CustomerPortalService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService, private readonly audit: AuditService) {}

  /** Public signup always creates an independent basic account. Company identity
   * is a claim until checked by staff: never auto-link by a submitted NIT. */
  async register(dto: RegisterPortalAccountDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.portalAccount.findUnique({where:{email},select:{id:true}});
    if(exists) throw new ConflictException('Ya existe una cuenta para este correo');
    const passwordHash = await bcrypt.hash(dto.password,12);
    try {
      const account = await this.prisma.portalAccount.create({data:{
        email,passwordHash,contactName:dto.contactName.trim(),companyName:dto.companyName.trim(),
        documentId:dto.documentId?.trim()||null,phone:dto.phone?.trim()||null,
        type:PortalAccountType.FINAL_CUSTOMER,state:PortalAccountState.ACTIVE,
      }});
      return {id:account.id,state:account.state,message:'Cuenta creada. Ya puedes ingresar como cliente final.'};
    } catch(error) {
      if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') throw new ConflictException('Ya existe una cuenta para este correo');
      throw error;
    }
  }

  private async priceMapping(type:PortalAccountType,tierId?:string|null) {
    if(tierId) {
      const tier=await this.prisma.portalTier.findUnique({where:{id:tierId},include:{priceList:true}});
      if(!tier?.isActive) throw new BadRequestException('Tu escalafón comercial no está activo; contacta a tu asesor');
      if(!tier.priceListId)return null;
      if(!tier.priceList?.isActive) throw new BadRequestException('La tarifa de tu escalafón no está activa');
      return {priceListId:tier.priceListId,priceList:tier.priceList};
    }
    const mapping=await this.prisma.portalPriceListMapping.findUnique({where:{type},include:{priceList:true}});
    if(mapping?.priceList.isActive)return mapping;
    if(type===PortalAccountType.FINAL_CUSTOMER)return null;
    throw new BadRequestException('No hay una tarifa activa configurada para este tipo de cliente');
  }

  listAccounts() {
    return this.prisma.portalAccount.findMany({orderBy:{createdAt:'desc'},take:1000,select:{
      id:true,email:true,contactName:true,companyName:true,documentId:true,type:true,state:true,
      tierId:true,tier:{select:{id:true,name:true,isActive:true}},createdAt:true,
    }});
  }
  listTiers() {return this.prisma.portalTier.findMany({orderBy:{name:'asc'},include:{priceList:{select:{id:true,name:true,isActive:true}}}});}
  async saveTier(dto:PortalTierDto,actorId:string,id?:string) {
    if(id&&!await this.prisma.portalTier.findUnique({where:{id}}))throw new NotFoundException('Escalafón no encontrado');
    const duplicate=await this.prisma.portalTier.findFirst({where:{name:{equals:dto.name,mode:'insensitive'},...(id?{id:{not:id}}:{})}});
    if(duplicate)throw new ConflictException('Ya existe un escalafón con ese nombre');
    if(dto.priceListId) {
      const list=await this.prisma.priceList.findUnique({where:{id:dto.priceListId}});
      if(!list?.isActive)throw new BadRequestException('Selecciona una tarifa activa');
    }
    const tier=id?await this.prisma.portalTier.update({where:{id},data:dto}):await this.prisma.portalTier.create({data:dto});
    await this.audit.log({userId:actorId,action:id?'update':'create',entity:'PortalTier',entityId:tier.id,newValues:{name:tier.name,priceListId:tier.priceListId,isActive:tier.isActive}});
    return tier;
  }
  async assignTier(id:string,dto:AssignPortalTierDto,actorId:string) {
    if(dto.tierId===undefined)throw new BadRequestException('Indica el escalafón o null para cliente final');
    const account=await this.prisma.portalAccount.findUnique({where:{id}});
    if(!account||account.state!=='ACTIVE')throw new BadRequestException('La cuenta debe estar activa');
    if(dto.tierId) {
      const tier=await this.prisma.portalTier.findUnique({where:{id:dto.tierId}});
      if(!tier?.isActive)throw new BadRequestException('Selecciona un escalafón activo');
    }
    const updated=await this.prisma.portalAccount.update({where:{id},data:{tierId:dto.tierId,type:PortalAccountType.FINAL_CUSTOMER}});
    await this.audit.log({userId:actorId,action:'update',entity:'PortalAccount',entityId:id,oldValues:{tierId:account.tierId,type:account.type},newValues:{tierId:updated.tierId,type:updated.type}});
    return {id:updated.id,tierId:updated.tierId};
  }

  async login(emailInput: string, password: string, meta: { ipAddress?: string; userAgent?: string }) {
    const email = emailInput.trim().toLowerCase();
    const account = await this.prisma.portalAccount.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, account?.passwordHash ?? DUMMY_HASH);
    if (!account || !valid) throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    // El estado se revela SOLO con contraseña correcta (dueño de la cuenta);
    // sin contraseña el login sigue siendo un 401 genérico anti-enumeración.
    if (account.state === 'PENDING') throw new ForbiddenException('Cuenta pendiente de aprobación comercial.');
    if (account.state === 'REJECTED') throw new ForbiddenException('La solicitud de acceso fue rechazada.');
    const hours = this.config.get<number>('PORTAL_SESSION_HOURS', 8);
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    const jti = randomUUID();
    await this.prisma.portalSession.create({ data: { jti, accountId: account.id, expiresAt, ...meta } });
    const token = this.jwt.sign({ sub: account.id, jti, scope: 'customer_portal' }, { expiresIn: `${hours}h` });
    return { token, expiresAt, account: { id: account.id, email: account.email, type: account.type } };
  }

  async logout(jti: string) { await this.prisma.portalSession.updateMany({ where: { jti, revokedAt: null }, data: { revokedAt: new Date() } }); }

  async getCatalog(query: CatalogQueryDto, accountType?: PortalAccountType, tierId?:string|null) {
    const where: Prisma.ProductWhereInput = {
      lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true,
      category: { isActive: true }, brand: { isActive: true },
      ...(query.search?.trim() ? { OR: [
        { name: { contains: query.search.trim(), mode: 'insensitive' } }, { sku: { contains: query.search.trim(), mode: 'insensitive' } },
      ] } : {}),
      ...(query.category ? { category: { slug: query.category, isActive: true } } : {}),
      ...(query.brand ? { brand: { slug: query.brand, isActive: true } } : {}),
    };
    const [mapping, data, total] = await Promise.all([
      accountType ? this.priceMapping(accountType,tierId) : null,
      this.prisma.product.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { name: 'asc' }, include: {
        category: { select: { name: true, slug: true } }, brand: { select: { name: true, slug: true } },
        images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } },
      }}),
      this.prisma.product.count({ where }),
    ]);
    // Resolución de precios en UNA consulta (no N+1): tarifas vigentes del
    // price list del tipo, mapeadas por producto.
    const now = new Date();
    let pricesByProduct = new Map<string, { value: string; currency: string } | null>();
    if (mapping && data.length > 0) {
      const prices = await this.prisma.price.findMany({
        where: {
          productId: { in: data.map((p) => p.id) },
          priceListId: mapping.priceListId,
          OR: [{ validFrom: null }, { validFrom: { lte: now } }],
          AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
        },
        select: { productId: true, value: true, currency: true },
      });
      pricesByProduct = new Map(
        data.map((p) => {
          const price = prices.find((pr) => pr.productId === p.id);
          return [p.id, price ? { value: price.value.toString(), currency: price.currency } : null];
        }),
      );
    }
    const output = data.map((p) => {
      const item: any = { id: p.id, sku: p.sku, name: p.name, description: p.description, category: p.category, brand: p.brand, image: p.images[0] ?? null };
      if (mapping) item.price = pricesByProduct.get(p.id) ?? null;
      return item;
    });
    return { data: output, meta: { total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) } };
  }

  /**
   * Detail has the same publication boundary as the collection. A missing or
   * unpublished item is deliberately a 404, rather than exposing its state.
   */
  async getProductDetail(id: string, accountType?: PortalAccountType, tierId?:string|null) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        lifecycleStatus: 'PUBLISHED',
        isActive: true,
        isVisible: true,
        category: { isActive: true },
        brand: { isActive: true },
      },
      include: {
        category: { select: { name: true, slug: true } },
        brand: { select: { name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { url: true, alt: true, isPrimary: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const detail: any = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      technicalSpecs: product.technicalSpecs,
      category: product.category,
      brand: product.brand,
      images: product.images,
    };
    if (!accountType) return detail;

    const mapping = await this.priceMapping(accountType,tierId);
    if(!mapping) {detail.price=null;return detail;}
    const now = new Date();
    const price = await this.prisma.price.findFirst({
      where: {
        productId: product.id,
        priceListId: mapping.priceListId,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
      },
      select: { value: true, currency: true },
    });
    detail.price = price ? { value: price.value.toString(), currency: price.currency } : null;
    return detail;
  }

  /** Cola de revisión. Incluye el Customer enlazado por coincidencia de NIT/email. */
  async listPending() {
    return this.prisma.portalAccount.findMany({
      where: { state: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, email: true, contactName: true, companyName: true, documentId: true, phone: true,
        type: true, state: true, createdAt: true,
        customer: { select: { id: true, code: true, name: true, documentId: true, email: true } },
      },
    });
  }

  async approve(id: string, dto: ApprovePortalAccountDto, actorId: string) {
    const account = await this.prisma.portalAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Solicitud de portal no encontrada');
    if (account.state !== 'PENDING') throw new ConflictException('La solicitud ya fue revisada');
    const mapping = await this.prisma.portalPriceListMapping.findUnique({ where: { type: account.type }, include: { priceList: true } });
    if (!mapping || !mapping.priceList.isActive) throw new BadRequestException('Configure una tarifa activa para el tipo de cliente antes de aprobar');
    let customerId = dto.customerId;
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer || !customer.isActive) throw new NotFoundException('Cliente no encontrado');
    } else if (account.customerId) {
      // Coincidencia detectada al registrarse (NIT/email): reutilizar el
      // Customer existente en vez de crear un duplicado con el mismo NIT.
      customerId = account.customerId;
    } else {
      const customer = await this.prisma.customer.create({
        data: {
          code: await this.generateCustomerCode(),
          name: account.companyName,
          documentType: account.documentId ? 'NIT' : null,
          documentId: account.documentId,
          email: account.email,
          phone: account.phone,
          status: 'CLIENTE',
          source: 'WEB',
          convertedAt: new Date(),
          createdById: actorId,
        },
      });
      customerId = customer.id;
    }
    const updated = await this.prisma.portalAccount.update({ where: { id }, data: { state: 'ACTIVE', customerId, approvedById: actorId, approvedAt: new Date() } });
    await this.audit.log({ userId: actorId, action: 'approve', entity: 'PortalAccount', entityId: id, newValues: { customerId, type: updated.type, priceListId: mapping.priceListId } });
    return { id: updated.id, state: updated.state, customerId };
  }

  /**
   * Código secuencial CL-####, igual al de CustomersService.generateCode
   * (allí es privado). Aprobar un portal debe producir clientes con el mismo
   * formato que el resto del módulo comercial, no códigos ad-hoc.
   */
  private async generateCustomerCode(attempt = 0): Promise<string> {
    if (attempt >= 5) return `CL-${Date.now().toString(36).toUpperCase()}`;
    const last = await this.prisma.customer.findFirst({
      where: { code: { startsWith: 'CL-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last?.code ? parseInt(last.code.slice(3), 10) : 0;
    const candidate = `CL-${String((Number.isFinite(lastNum) ? lastNum : 0) + 1).padStart(4, '0')}`;
    const exists = await this.prisma.customer.findUnique({ where: { code: candidate }, select: { id: true } });
    return exists ? this.generateCustomerCode(attempt + 1) : candidate;
  }

  async reject(id: string, dto: RejectPortalAccountDto, actorId: string) {
    const updated = await this.prisma.portalAccount.updateMany({ where: { id, state: 'PENDING' }, data: { state: 'REJECTED', rejectedById: actorId, rejectedAt: new Date(), rejectionReason: dto.reason.trim() } });
    if (!updated.count) throw new ConflictException('La solicitud no existe o ya fue revisada');
    await this.audit.log({ userId: actorId, action: 'reject', entity: 'PortalAccount', entityId: id, newValues: { reason: dto.reason.trim() } });
    return { id, state: PortalAccountState.REJECTED };
  }

  async listMappings() {
    return this.prisma.portalPriceListMapping.findMany({
      include: { priceList: { select: { id: true, name: true, code: true, currency: true, isActive: true } } },
      orderBy: { type: 'asc' },
    });
  }

  async upsertMapping(dto: UpsertPortalPriceListMappingDto, actorId: string) {
    const list = await this.prisma.priceList.findUnique({ where: { id: dto.priceListId } });
    if (!list || !list.isActive) throw new BadRequestException('La tarifa debe existir y estar activa');
    const mapping = await this.prisma.portalPriceListMapping.upsert({ where: { type: dto.type }, create: dto, update: { priceListId: dto.priceListId } });
    await this.audit.log({ userId: actorId, action: 'upsert', entity: 'PortalPriceListMapping', entityId: mapping.id, newValues: { type: dto.type, priceListId: dto.priceListId } });
    return mapping;
  }
}
