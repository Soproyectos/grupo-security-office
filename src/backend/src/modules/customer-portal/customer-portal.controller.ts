import { AssignPortalAdvisorDto, AssignPortalTierDto, LinkPortalCustomerDto, PortalTierDto } from './dto/portal-tier.dto';
import { Body, Controller, ForbiddenException, Optional, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortalAuthGuard, PORTAL_COOKIE, RequireApprovedPortalAccount } from './portal-auth.guard';
import { CustomerPortalService, portalPricing } from './customer-portal.service';
import type { PortalAdminContext } from './portal-account-access.service';
import { CatalogPricesQueryDto } from './dto/catalog-prices-query.dto';
import { CreatePortalQuoteDto } from './dto/create-portal-quote.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { ApprovePortalAccountDto, RejectPortalAccountDto } from './dto/review-portal-account.dto';
import { UpsertPortalPriceListMappingDto } from './dto/upsert-price-list-mapping.dto';
import { ConfigService } from '@nestjs/config';
import { SuspendPortalAccountDto, UpdatePortalProfileDto } from './dto/portal-profile.dto';
import { DeletePortalAccountDto } from './dto/delete-portal-account.dto';
import { isProfileComplete, portalAccountView } from './portal-profile';
import { PortalAuthService } from './portal-auth/portal-auth.service';
import { CreatePortalPasswordDto } from './dto/create-portal-password.dto';

/**
 * Cuentas del portal (panel): ya no son solo Super Admin. Cada ruta exige una acción de panel
 * (`portalAccounts:read|manage|assign`) con su alcance propio / de equipo / total; la comprobación vive en el
 * servicio (PortalAccountAccessService) porque depende de la cuenta concreta. Niveles y tarifa general exigen la
 * acción de panel `portalTariffs:manage` (global); las zonas, `portalZones:manage`. Super Admin conserva todo.
 */

/**
 * Portal comercial de clientes. Tres zonas con autenticaciones INDEPENDIENTES:
 *
 * 1. Rutas públicas (@Public): catálogo sin precios, registro y login. El
 *    guard global interno (JwtAuthGuard) las salta por el decorador.
 * 2. Rutas de sesión de cliente (@Public + PortalAuthGuard): la sesión es la
 *    del PORTAL (cookie `customer_access_token`, scope 'customer_portal'),
 *    nunca la del panel interno. Sin @Public, el guard global interno las
 *    bloquearía antes de que PortalAuthGuard llegara a ejecutarse.
 * 3. Rutas admin: SIN @Public → exigen sesión interna (JwtAuthGuard) y, según la ruta, la acción de
 *    panel con su alcance (servicio): cuentas con `portalAccounts:*`, niveles y tarifa general con `portalTariffs:manage`.
 */
@ApiTags('Customer Portal')
@Controller('api/customer-portal')
export class CustomerPortalController {
  constructor(private readonly portal: CustomerPortalService, private readonly config: ConfigService, @Optional() private readonly portalAuth?: PortalAuthService) {}
  private isProd() { return this.config.get<string>('NODE_ENV') === 'production'; }
  private requireCompleteProfile(req: any) {
    if (!isProfileComplete(req.portalAccount)) throw new ForbiddenException({ code: 'PROFILE_INCOMPLETE', message: 'Completa tus datos para continuar' });
  }
  private adminCtx(user: any): PortalAdminContext { return { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], jti: user?.jti }; }
  private meta(req: Request) { return { ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 255) }; }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: PortalLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.portal.login(dto.email, dto.password, this.meta(req));
    res.cookie(PORTAL_COOKIE, result.token, { httpOnly: true, secure: this.isProd(), sameSite: 'strict', path: '/', expires: result.expiresAt });
    return { account: result.account };
  }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('auth/me')
  me(@Req() req: any) { return {account:portalAccountView(req.portalAccount)}; }

  /** First password for accounts created with Google. Only the session owner; the hash never leaves Better Auth. */
  @Public()
  @UseGuards(PortalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('auth/me/password')
  @HttpCode(HttpStatus.OK)
  createPassword(@Body() dto: CreatePortalPasswordDto, @Req() req: any) {
    return this.portal.createOwnPassword(req.portalAccount, dto.newPassword, (password) => this.portalAuth!.setPassword(req.headers, password));
  }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Patch('auth/me/profile')
  updateProfile(@Body() dto: UpdatePortalProfileDto, @Req() req: any) { return this.portal.updateProfile(req.portalAccount.id, dto); }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Post('auth/me/deletion-request')
  @HttpCode(HttpStatus.OK)
  requestDeletion(@Req() req: any) { return this.portal.requestDeletion(req.portalAccount.id); }

  /** Self-service deletion: only the session owner (req.portalAccount), never an id from the body. */
  @Public()
  @UseGuards(PortalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('auth/me/delete')
  @HttpCode(HttpStatus.OK)
  deleteOwnAccount(@Body() dto: DeletePortalAccountDto, @Req() req: any) { return this.portal.deleteOwnAccount(req.portalAccount, dto); }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.portal.logout(req.portalAccount.jti);
    res.clearCookie(PORTAL_COOKIE, { httpOnly: true, secure: this.isProd(), sameSite: 'strict', path: '/' });
    return { message: 'Sesión cerrada' };
  }

  /** Priced routes: a PENDING account can sign in and see itself, but is denied here (RequireApprovedPortalAccount, read by the guard). */
  /** Precios del cliente para una lista de referencias de la vitrina. Respuesta privada: depende de la sesión. */
  @Public()
  @RequireApprovedPortalAccount()
  @UseGuards(PortalAuthGuard)
  @Get('customer/catalog/prices')
  async customerPrices(@Query() query: CatalogPricesQueryDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    this.requireCompleteProfile(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    // Sin cliente vinculado no hay tarifa: no hay precios.
    const pricing = portalPricing(req.portalAccount);
    if (!pricing) return { prices: [] };
    // El interceptor global ya envuelve la respuesta en `data`: aquí se devuelve el objeto directo.
    return this.portal.getCatalogPrices(query.ids, pricing.type, pricing.tierId);
  }

  /** The customer sends the quote built in the store (company tariff, advisor of the company). */
  @Public()
  @RequireApprovedPortalAccount()
  @UseGuards(PortalAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('customer/quotes')
  @HttpCode(HttpStatus.CREATED)
  createQuote(@Body() dto: CreatePortalQuoteDto, @Req() req: any) {
    this.requireCompleteProfile(req);
    return this.portal.createCustomerQuote(req.portalAccount, dto);
  }

  /** "Mis cotizaciones": only the ones this person sent. Private response. */
  @Public()
  @RequireApprovedPortalAccount()
  @UseGuards(PortalAuthGuard)
  @Get('customer/quotes')
  listQuotes(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    this.requireCompleteProfile(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    return this.portal.listCustomerQuotes(req.portalAccount.id);
  }

  @Public()
  @RequireApprovedPortalAccount()
  @UseGuards(PortalAuthGuard)
  @Get('customer/quotes/:id')
  quoteDetail(@Param('id') id: string, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    this.requireCompleteProfile(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    return this.portal.getCustomerQuote(req.portalAccount.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/accounts/pending')
  @ApiBearerAuth()
  pending(@CurrentUser() user: any) { return this.portal.listPending(this.adminCtx(user)); }

  @UseGuards(JwtAuthGuard)
  @Post('admin/accounts/:id/approve')
  @ApiBearerAuth()
  approve(@Param('id') id: string, @Body() dto: ApprovePortalAccountDto, @CurrentUser() user: any) { return this.portal.approve(id, dto, this.adminCtx(user)); }

  @UseGuards(JwtAuthGuard)
  @Post('admin/accounts/:id/reject')
  @ApiBearerAuth()
  reject(@Param('id') id: string, @Body() dto: RejectPortalAccountDto, @CurrentUser() user: any) { return this.portal.reject(id, dto, this.adminCtx(user)); }

  @UseGuards(JwtAuthGuard)
  @Get('admin/price-list-mappings')
  @ApiBearerAuth()
  async listMappings(@CurrentUser() user: any) { await this.portal.requireTariffAdmin(this.adminCtx(user)); return this.portal.listMappings(); }

  @UseGuards(JwtAuthGuard)
  @Post('admin/price-list-mappings')
  @ApiBearerAuth()
  async mapping(@Body() dto: UpsertPortalPriceListMappingDto, @CurrentUser() user: any) { await this.portal.requireTariffAdmin(this.adminCtx(user)); return this.portal.upsertMapping(dto, user.sub ?? user.id); }
  @Get('admin/accounts') @UseGuards(JwtAuthGuard)
  accounts(@CurrentUser() user:any) {return this.portal.listAccounts(this.adminCtx(user));}
  /** Super Admin: full tiers. Advisors with portalAccounts:manage: active tiers only, to pick one for a company. */
  @Get('admin/tiers') @UseGuards(JwtAuthGuard)
  tiers(@CurrentUser() user:any) {return this.portal.listTiersFor(this.adminCtx(user));}
  /** Active price lists to pick a tariff for an account (portalAccounts:manage). Only id, name, code and currency: never prices. */
  @Get('admin/tariff-options') @UseGuards(JwtAuthGuard)
  tariffOptions(@CurrentUser() user:any) {return this.portal.listTariffOptions(this.adminCtx(user));}
  @Post('admin/tiers') @UseGuards(JwtAuthGuard)
  async createTier(@Body() dto:PortalTierDto,@CurrentUser() user:any) {await this.portal.requireTariffAdmin(this.adminCtx(user));return this.portal.saveTier(dto,user.sub??user.id);}
  @Patch('admin/tiers/:id') @UseGuards(JwtAuthGuard)
  async editTier(@Param('id') id:string,@Body() dto:PortalTierDto,@CurrentUser() user:any) {await this.portal.requireTariffAdmin(this.adminCtx(user));return this.portal.saveTier(dto,user.sub??user.id,id);}
  @Post('admin/accounts/:id/suspend') @HttpCode(HttpStatus.OK) @UseGuards(JwtAuthGuard)
  suspend(@Param('id') id:string,@Body() dto:SuspendPortalAccountDto,@CurrentUser() user:any) {return this.portal.suspend(id,dto.reason,this.adminCtx(user));}
  @Post('admin/accounts/:id/reactivate') @HttpCode(HttpStatus.OK) @UseGuards(JwtAuthGuard)
  reactivate(@Param('id') id:string,@CurrentUser() user:any) {return this.portal.reactivate(id,this.adminCtx(user));}
  /** Sets the tariff of the account: a price list (the server finds or creates its tier), a tier, or null for the general tariff. */
  @Patch('admin/accounts/:id/tier') @UseGuards(JwtAuthGuard)
  assignTier(@Param('id') id:string,@Body() dto:AssignPortalTierDto,@CurrentUser() user:any) {return this.portal.assignTier(id,dto,this.adminCtx(user));}
  @Patch('admin/accounts/:id/customer') @UseGuards(JwtAuthGuard)
  linkCustomer(@Param('id') id:string,@Body() dto:LinkPortalCustomerDto,@CurrentUser() user:any) {return this.portal.linkCustomer(id,dto.customerId??null,this.adminCtx(user));}
  /** Advisors the caller may assign (portalAccounts:assign). */
  @Get('admin/advisors') @UseGuards(JwtAuthGuard)
  advisors(@CurrentUser() user:any) {return this.portal.listAdvisors(this.adminCtx(user));}
  /** Assign / reassign the advisor (portalAccounts:assign, own, team or global scope). */
  @Patch('admin/accounts/:id/advisor') @UseGuards(JwtAuthGuard)
  assignAdvisor(@Param('id') id:string,@Body() dto:AssignPortalAdvisorDto,@CurrentUser() user:any) {return this.portal.assignAdvisor(id,dto,this.adminCtx(user));}
}
