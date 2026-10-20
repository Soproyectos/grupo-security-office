import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomerAccount, Prisma } from "@prisma/client";
import { applyRevisionLens, loadActiveRevisionContents } from '../products/public-revision-lens';
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { isEmail } from "class-validator";
import { PrismaService } from "../../prisma/prisma.service";
import { PasswordPolicyService } from "../../common/security/password-policy.service";
import { StorefrontMailService } from "./storefront-mail.service";
import {
  ConsumeCustomerTokenDto,
  CustomerLoginDto,
  InquiryDto,
  RequestAccountDto,
  ReviewAccountDto,
  StorefrontQueryDto,
  StorefrontSettingsDto,
  StorefrontAdminQueryDto,
} from "./storefront.dto";

export const hashCustomerToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const DEFAULT_STOREFRONT_SETTINGS = {
  publicPriceListId: "",
  pricesIncludeTax: false,
  senderName: "Grupo Security",
  senderEmail: "",
  supportEmail: "",
  supportPhone: "",
  whatsapp: "",
  hours: "",
  about:
    "Grupo Security reúne soluciones de videovigilancia, control de acceso, automatización, energía y respaldo. Encuentra equipos y orientación comercial para tu hogar, empresa o próximo proyecto.",
  privacy: "",
  terms: "",
  warranty: "",
};
const safeAccountSelect = {
  id: true,
  email: true,
  name: true,
  company: true,
  profile: true,
  status: true,
  emailVerifiedAt: true,
  reviewReason: true,
  priceListId: true,
  createdAt: true,
} satisfies Prisma.CustomerAccountSelect;
const validity = (now: Date) => ({
  AND: [
    { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
    { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
  ],
});

@Injectable()
export class StorefrontService {
  private readonly logger = new Logger(StorefrontService.name);
  private readonly dummyHash = bcrypt.hashSync(
    randomBytes(32).toString("hex"),
    12,
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordPolicyService,
    private readonly mail: StorefrontMailService,
  ) {}

  async settings() {
    const row = await this.prisma.storefrontSettings.findUnique({
      where: { id: "default" },
    });
    return {
      ...DEFAULT_STOREFRONT_SETTINGS,
      ...((row?.data as Partial<typeof DEFAULT_STOREFRONT_SETTINGS>) ?? {}),
    };
  }
  async publicSettings() {
    const {
      senderName: _name,
      senderEmail: _email,
      publicPriceListId: _list,
      ...settings
    } = await this.settings();
    return settings;
  }
  async saveSettings(dto: StorefrontSettingsDto, reviewerId: string) {
    for (const address of [dto.senderEmail, dto.supportEmail])
      if (address && !isEmail(address))
        throw new BadRequestException("El correo configurado no es válido.");
    for (const phone of [dto.whatsapp, dto.supportPhone])
      if (phone && !/^\+?[\d ()-]{7,30}$/.test(phone))
        throw new BadRequestException("El teléfono configurado no es válido.");
    if (
      dto.publicPriceListId &&
      !(await this.prisma.priceList.findFirst({
        where: {
          id: dto.publicPriceListId,
          isActive: true,
          ...validity(new Date()),
        },
      }))
    )
      throw new BadRequestException(
        "Selecciona una tarifa pública activa y vigente.",
      );
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.storefrontSettings.upsert({
        where: { id: "default" },
        create: { data: dto as unknown as Prisma.InputJsonValue },
        update: { data: dto as unknown as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          userId: reviewerId,
          action: "storefront_settings_update",
          entity: "StorefrontSettings",
          entityId: "default",
          result: "SUCCESS",
        },
      });
      return result.data;
    });
  }
  assertOrigin(origin?: string) {
    if (
      origin &&
      origin !==
        new URL(
          this.config.get<string>("STOREFRONT_URL") || "http://localhost:5173",
        ).origin
    )
      throw new ForbiddenException("Origen no autorizado.");
  }
  private async sendAccessMail(
    account: Pick<CustomerAccount, "id" | "email" | "name">,
    purpose: "VERIFY" | "RESET",
  ) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + (purpose === "VERIFY" ? 24 * 60 : 30) * 60000,
    );
    await this.prisma.$transaction([
      this.prisma.customerAccessToken.deleteMany({
        where: { accountId: account.id, purpose, usedAt: null },
      }),
      this.prisma.customerAccessToken.create({
        data: {
          accountId: account.id,
          purpose,
          tokenHash: hashCustomerToken(token),
          expiresAt,
        },
      }),
    ]);
    const settings = await this.settings();
    const url = new URL(
      purpose === "VERIFY" ? "/clientes/verificar" : "/clientes/restablecer",
      this.config.get<string>("STOREFRONT_URL") || "http://localhost:5173",
    );
    url.searchParams.set("token", token);
    await this.mail.send(
      account.email,
      purpose === "VERIFY"
        ? "Verifica tu correo · Grupo Security"
        : "Recupera tu acceso · Grupo Security",
      `Hola ${account.name}.\n\n${purpose === "VERIFY" ? "Verifica tu correo y crea tu contraseña para continuar con tu solicitud comercial." : "Usa este enlace para restablecer tu contraseña."}\n\n${url.toString()}\n\nEl enlace es personal, tiene vencimiento y solo puede usarse una vez. Si no lo solicitaste, puedes ignorar este correo.`,
      { name: settings.senderName, address: settings.senderEmail },
    );
  }
  private async assertMailReady() {
    if (
      !this.mail.configured ||
      (!(await this.settings()).senderEmail && !this.config.get("SMTP_FROM"))
    )
      throw new ServiceUnavailableException(
        "El envío de correos aún no está configurado. Puedes registrar tu consulta con el equipo comercial.",
      );
  }
  private async deliverAccessMail(
    account: Pick<CustomerAccount, "id" | "email" | "name">,
    purpose: "VERIFY" | "RESET",
  ) {
    try {
      await this.sendAccessMail(account, purpose);
    } catch {
      this.logger.warn(
        `Customer ${purpose} mail delivery failed; account ${account.id}.`,
      );
    }
  }
  async requestAccount(dto: RequestAccountDto) {
    await this.assertMailReady();
    const existing = await this.prisma.customerAccount.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      if (!existing.emailVerifiedAt)
        await this.deliverAccessMail(existing, "VERIFY");
      return {
        message:
          "Revisa tu correo para continuar. Si no recibes un enlace, vuelve a solicitarlo o registra una consulta con el equipo comercial. Si ya tienes cuenta, puedes ingresar o recuperar tu contraseña.",
      };
    }
    const account = await this.prisma.customerAccount.upsert({
      where: { email: dto.email },
      update: {},
      create: {
        email: dto.email,
        name: dto.name.trim(),
        company: dto.company?.trim(),
        profile: dto.profile,
        consentAt: new Date(),
        consentVersion: "account-request-v1",
      },
    });
    await this.deliverAccessMail(account, "VERIFY");
    return {
      message:
        "Revisa tu correo para continuar. Si no recibes un enlace, vuelve a solicitarlo o registra una consulta con el equipo comercial. Si ya tienes cuenta, puedes ingresar o recuperar tu contraseña.",
    };
  }
  async requestReset(email: string) {
    await this.assertMailReady();
    const account = await this.prisma.customerAccount.findUnique({
      where: { email },
    });
    if (account?.emailVerifiedAt && account.status !== "SUSPENDED")
      await this.deliverAccessMail(account, "RESET");
    return {
      message:
        "Revisa el correo de tu cuenta verificada. Si no encuentras un enlace de recuperación, vuelve a intentarlo o registra una consulta con el equipo comercial.",
    };
  }
  async consumeToken(
    dto: ConsumeCustomerTokenDto,
    purpose: "VERIFY" | "RESET",
  ) {
    const tokenHash = hashCustomerToken(dto.token);
    const token = await this.prisma.customerAccessToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    });
    if (
      !token ||
      token.purpose !== purpose ||
      token.usedAt ||
      token.expiresAt <= new Date() ||
      token.account.status === "SUSPENDED" ||
      (purpose === "VERIFY" && token.account.emailVerifiedAt)
    )
      throw new BadRequestException(
        "El enlace no es válido o venció. Solicita uno nuevo.",
      );
    if (Buffer.byteLength(dto.password, "utf8") > 72)
      throw new BadRequestException(
        "La contraseña supera el límite de 72 bytes.",
      );
    this.passwords.assert(dto.password, {
      userInputs: [token.account.email, token.account.name],
    });
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.customerAccessToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new BadRequestException("El enlace ya fue utilizado o venció.");
      await tx.customerAccount.update({
        where: { id: token.accountId },
        data: {
          passwordHash,
          failedLogins: 0,
          lockedUntil: null,
          ...(purpose === "VERIFY"
            ? { emailVerifiedAt: new Date(), status: "PENDING" }
            : {}),
        },
      });
      await tx.customerSession.deleteMany({
        where: { accountId: token.accountId },
      });
      await tx.customerAccessToken.updateMany({
        where: { accountId: token.accountId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
    return {
      message:
        purpose === "VERIFY"
          ? "Correo verificado. Ya puedes ingresar; tu solicitud comercial está pendiente de revisión."
          : "Contraseña actualizada. Ingresa nuevamente con tu nueva contraseña.",
    };
  }
  async login(dto: CustomerLoginDto) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { email: dto.email },
    });
    const valid =
      (await bcrypt.compare(
        dto.password,
        account?.passwordHash || this.dummyHash,
      )) && Buffer.byteLength(dto.password, "utf8") <= 72;
    if (
      !account ||
      !valid ||
      !account.emailVerifiedAt ||
      account.status === "SUSPENDED" ||
      (account.lockedUntil && account.lockedUntil > new Date())
    ) {
      if (account && !valid)
        await this.prisma.customerAccount.update({
          where: { id: account.id },
          data: {
            failedLogins: { increment: 1 },
            ...(account.failedLogins >= 4
              ? { lockedUntil: new Date(Date.now() + 15 * 60000) }
              : {}),
          },
        });
      throw new UnauthorizedException(
        "No pudimos validar el acceso. Revisa tus datos, verifica tu correo o intenta más tarde.",
      );
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + (dto.remember ? 30 * 24 : 8) * 3600000,
    );
    await this.prisma.$transaction([
      this.prisma.customerAccount.update({
        where: { id: account.id },
        data: { failedLogins: 0, lockedUntil: null },
      }),
      this.prisma.customerSession.create({
        data: {
          accountId: account.id,
          tokenHash: hashCustomerToken(token),
          expiresAt,
        },
      }),
    ]);
    return { token, expiresAt, account: await this.account(account.id) };
  }
  async sessionAccount(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashCustomerToken(token) },
      include: { account: true },
    });
    return session &&
      session.expiresAt > new Date() &&
      session.account.emailVerifiedAt &&
      session.account.status !== "SUSPENDED"
      ? session.account
      : null;
  }
  async logout(token?: string) {
    if (token)
      await this.prisma.customerSession.deleteMany({
        where: { tokenHash: hashCustomerToken(token) },
      });
    return { message: "Sesión cerrada." };
  }
  account(id: string) {
    return this.prisma.customerAccount.findUniqueOrThrow({
      where: { id },
      select: safeAccountSelect,
    });
  }

  /** Keep the current catalogue payload and presentation; resolve only its price. */
  async applyCustomerPrices<T extends { id: string; price: { value: number; currency: string } | null }>(
    products: T[],
    sessionToken?: string,
  ): Promise<T[]> {
    if (!products.length) return products;
    const settings = await this.settings();
    const account = await this.sessionAccount(sessionToken);
    const privateList = account?.status === "APPROVED" ? account.priceListId : null;
    const lists = [settings.publicPriceListId, privateList].filter((id): id is string => Boolean(id));
    const legacyPublic = !settings.publicPriceListId && !(await this.prisma.storefrontSettings.findUnique({ where: { id: "default" }, select: { id: true } }));
    if (!lists.length) return legacyPublic ? products : products.map((product) => ({ ...product, price: null }));
    const now = new Date();
    const rows = await this.prisma.price.findMany({
      where: {
        productId: { in: products.map((product) => product.id) },
        priceListId: { in: lists },
        ...validity(now),
        priceList: { isActive: true, ...validity(now) },
        OR: [{ listaId: null }, { lista: { isActive: true, archivedAt: null, deletionStatus: null, ...validity(now) } }],
      },
      select: { productId: true, priceListId: true, value: true, currency: true },
    });
    return products.map((product) => {
      const professional = privateList && rows.find((row) => row.productId === product.id && row.priceListId === privateList);
      const publicPrice = rows.find((row) => row.productId === product.id && row.priceListId === settings.publicPriceListId);
      const selected = professional || publicPrice;
      return { ...product, price: selected && Number(selected.value) > 0
        ? { value: Number(selected.value), currency: selected.currency }
        : legacyPublic ? product.price : null };
    });
  }

  private publishedWhere(query: StorefrontQueryDto): Prisma.ProductWhereInput {
    return {
      lifecycleStatus: "PUBLISHED",
      // CAT-02: la tienda solo sirve productos del catálogo (visibilidad unificada).
      catalogPublished: true,
      isActive: true,
      isVisible: true,
      AND: [
        {
          OR: [
            { listaId: null },
            {
              lista: {
                isActive: true,
                archivedAt: null,
                deletionStatus: null,
                ...validity(new Date()),
              },
            },
          ],
        },
      ],
      category: {
        isActive: true,
        ...(query.category
          ? {
              OR: [
                { slug: query.category },
                { parent: { slug: query.category } },
                { parent: { parent: { slug: query.category } } },
              ],
            }
          : {}),
      },
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: "insensitive" } },
              { sku: { contains: query.q.trim(), mode: "insensitive" } },
              {
                brand: {
                  name: { contains: query.q.trim(), mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };
  }
  async catalog(
    query: StorefrontQueryDto,
    sessionToken?: string,
    productId?: string,
  ) {
    const settings = await this.settings();
    const account = await this.sessionAccount(sessionToken);
    const privateList =
      account?.status === "APPROVED" ? account.priceListId : null;
    const listIds = [settings.publicPriceListId, privateList].filter(
      (id): id is string => Boolean(id),
    );
    const now = new Date();
    const where = {
      ...this.publishedWhere(query),
      ...(productId ? { id: productId } : {}),
    };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: query.skip ?? 0,
        take: productId ? 1 : (query.limit ?? 24),
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          technicalSpecs: true,
          documents: true,
          publicRevisionId: true,
          category: { select: { name: true, slug: true } },
          brand: { select: { name: true } },
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            select: { url: true, alt: true },
          },
          prices: {
            where: {
              priceListId: { in: listIds },
              ...validity(now),
              priceList: { isActive: true, ...validity(now) },
              OR: [
                { listaId: null },
                {
                  lista: {
                    isActive: true,
                    archivedAt: null,
                    deletionStatus: null,
                    ...validity(now),
                  },
                },
              ],
            },
            select: { value: true, currency: true, priceListId: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    if (productId && !products.length)
      throw new NotFoundException("Producto no disponible en el catálogo.");
    const result = products.map((product) => {
      const { prices, ...details } = product;
      const publicPrice = prices.find(
        (price) => price.priceListId === settings.publicPriceListId,
      );
      const professionalPrice = privateList
        ? prices.find((price) => price.priceListId === privateList)
        : null;
      const price = (entry: typeof publicPrice) =>
        entry
          ? {
              value: entry.value.toString(),
              currency: entry.currency,
              includesTax: settings.pricesIncludeTax,
            }
          : null;
      return {
        ...details,
        publicPrice: price(publicPrice),
        professionalPrice: price(professionalPrice ?? undefined),
      };
    });
    return productId
      ? result[0]
      : {
          products: result,
          total,
          skip: query.skip ?? 0,
          limit: query.limit ?? 24,
        };
  }
  async inquire(dto: InquiryDto) {
    if (
      dto.productId &&
      !(await this.prisma.product.findFirst({
        where: { id: dto.productId, ...this.publishedWhere({}) },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Producto no disponible.");
    const inquiry = await this.prisma.storefrontInquiry.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        topic: dto.topic,
        message: dto.message.trim(),
        productId: dto.productId,
      },
    });
    return {
      id: inquiry.id,
      message:
        "Tu consulta quedó registrada. El equipo comercial podrá revisarla desde su panel.",
    };
  }
  async adminOverview(query: StorefrontAdminQueryDto = {}) {
    const [
      settings,
      accounts,
      inquiries,
      priceLists,
      accountTotal,
      inquiryTotal,
    ] = await Promise.all([
      this.settings(),
      this.prisma.customerAccount.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: query.accountSkip ?? 0,
        take: 50,
        select: safeAccountSelect,
      }),
      this.prisma.storefrontInquiry.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: query.inquirySkip ?? 0,
        take: 50,
      }),
      this.prisma.priceList.findMany({
        where: { isActive: true, ...validity(new Date()) },
        select: { id: true, name: true, code: true, currency: true },
      }),
      this.prisma.customerAccount.count(),
      this.prisma.storefrontInquiry.count(),
    ]);
    return {
      settings,
      accounts,
      inquiries,
      priceLists,
      mailConfigured: this.mail.configured,
      accountTotal,
      inquiryTotal,
    };
  }
  async review(id: string, dto: ReviewAccountDto, reviewerId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException("Solicitud no encontrada.");
    if (!account.emailVerifiedAt)
      throw new BadRequestException(
        "El cliente debe verificar su correo antes de revisar su perfil.",
      );
    if (
      dto.status === "APPROVED" &&
      (!dto.priceListId ||
        !(await this.prisma.priceList.findFirst({
          where: {
            id: dto.priceListId,
            isActive: true,
            ...validity(new Date()),
          },
        })))
    )
      throw new BadRequestException(
        "Asigna una tarifa activa y vigente para aprobar la cuenta.",
      );
    if (["REJECTED", "SUSPENDED"].includes(dto.status) && !dto.reason?.trim())
      throw new BadRequestException("Indica el motivo de esta decisión.");
    return this.prisma.$transaction(async (tx) => {
      let customerId = account.customerId;
      if (dto.status === "APPROVED" && !customerId) {
        const customer = await tx.customer.upsert({
          where: { code: "WEB-" + account.id },
          update: {},
          create: {
            code: "WEB-" + account.id,
            name: account.company || account.name,
            email: account.email,
            status: "CLIENTE",
            source: "WEB",
            convertedAt: new Date(),
            ownerId: reviewerId,
            createdById: reviewerId,
          },
        });
        customerId = customer.id;
      }
      const result = await tx.customerAccount.update({
        where: { id },
        data: {
          status: dto.status,
          priceListId: dto.status === "APPROVED" ? dto.priceListId : null,
          reviewReason: dto.reason?.trim() || null,
          reviewedAt: new Date(),
          reviewedById: reviewerId,
          customerId,
        },
        select: safeAccountSelect,
      });
      if (dto.status === "SUSPENDED")
        await tx.customerSession.deleteMany({ where: { accountId: id } });
      await tx.auditLog.create({
        data: {
          userId: reviewerId,
          action: "customer_account_review",
          entity: "CustomerAccount",
          entityId: id,
          oldValues: { status: account.status },
          newValues: {
            status: dto.status,
            priceListId: dto.priceListId ?? null,
          },
          result: "SUCCESS",
        },
      });
      return result;
    });
  }
  async resolveInquiry(id: string, reviewerId: string) {
    if (
      !(await this.prisma.storefrontInquiry.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Consulta no encontrada.");
    return this.prisma.storefrontInquiry.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedById: reviewerId,
      },
    });
  }
}
