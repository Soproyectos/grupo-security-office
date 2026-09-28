import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ROLE } from '../../common/rbac/roles.constants';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortalAuthGuard, PORTAL_COOKIE } from './portal-auth.guard';
import { CustomerPortalService } from './customer-portal.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { RegisterPortalAccountDto } from './dto/register-portal-account.dto';
import { ApprovePortalAccountDto, RejectPortalAccountDto } from './dto/review-portal-account.dto';
import { UpsertPortalPriceListMappingDto } from './dto/upsert-price-list-mapping.dto';
import { ConfigService } from '@nestjs/config';

/** Revisión de cuentas: única matríz autorizada para aprobar/rechazar (PORTAL-02). */
const REVIEW_ROLES = [ROLE.SUPER_ADMIN, ROLE.SUPERVISOR, ROLE.ADMIN_COMERCIAL];
/** Configuración de tarifas por tipo: queda en manos del área comercial. */
const MAPPING_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN_COMERCIAL];

/**
 * Portal comercial de clientes. Tres zonas con autenticaciones INDEPENDIENTES:
 *
 * 1. Rutas públicas (@Public): catálogo sin precios, registro y login. El
 *    guard global interno (JwtAuthGuard) las salta por el decorador.
 * 2. Rutas de sesión de cliente (@Public + PortalAuthGuard): la sesión es la
 *    del PORTAL (cookie `customer_access_token`, scope 'customer_portal'),
 *    nunca la del panel interno. Sin @Public, el guard global interno las
 *    bloquearía antes de que PortalAuthGuard llegara a ejecutarse.
 * 3. Rutas admin: SIN @Public → exige sesión interna (guard global) y, vía
 *    RolesGuard por ruta, uno de los roles de revisión. El RolesGuard NO es
 *    global en esta app: sin @UseGuards(RolesGuard) el @Roles() es metadata
 *    muerta y cualquier usuario autenticado aprobaría cuentas.
 */
@ApiTags('Customer Portal')
@Controller('api/customer-portal')
export class CustomerPortalController {
  constructor(private readonly portal: CustomerPortalService, private readonly config: ConfigService) {}
  private isProd() { return this.config.get<string>('NODE_ENV') === 'production'; }
  private meta(req: Request) { return { ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 255) }; }

  @Public()
  @Get('catalog/products')
  publicCatalog(@Query() query: CatalogQueryDto) { return this.portal.getCatalog(query); }

  @Public()
  @Get('catalog/products/:id')
  publicProductDetail(@Param('id') id: string) { return this.portal.getProductDetail(id); }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('accounts/register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterPortalAccountDto) { return this.portal.register(dto); }

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
  me(@Req() req: any) { return { account: req.portalAccount }; }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.portal.logout(req.portalAccount.jti);
    res.clearCookie(PORTAL_COOKIE, { httpOnly: true, secure: this.isProd(), sameSite: 'strict', path: '/' });
    return { message: 'Sesión cerrada' };
  }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('customer/catalog/products')
  customerCatalog(@Query() query: CatalogQueryDto, @Req() req: any) { return this.portal.getCatalog(query, req.portalAccount.type); }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('customer/catalog/products/:id')
  customerProductDetail(@Param('id') id: string, @Req() req: any) { return this.portal.getProductDetail(id, req.portalAccount.type); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('admin/accounts/pending')
  @ApiBearerAuth()
  @Roles(...REVIEW_ROLES)
  pending() { return this.portal.listPending(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('admin/accounts/:id/approve')
  @ApiBearerAuth()
  @Roles(...REVIEW_ROLES)
  approve(@Param('id') id: string, @Body() dto: ApprovePortalAccountDto, @CurrentUser() user: any) { return this.portal.approve(id, dto, user.sub ?? user.id); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('admin/accounts/:id/reject')
  @ApiBearerAuth()
  @Roles(...REVIEW_ROLES)
  reject(@Param('id') id: string, @Body() dto: RejectPortalAccountDto, @CurrentUser() user: any) { return this.portal.reject(id, dto, user.sub ?? user.id); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('admin/price-list-mappings')
  @ApiBearerAuth()
  @Roles(...MAPPING_ROLES)
  listMappings() { return this.portal.listMappings(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('admin/price-list-mappings')
  @ApiBearerAuth()
  @Roles(...MAPPING_ROLES)
  mapping(@Body() dto: UpsertPortalPriceListMappingDto, @CurrentUser() user: any) { return this.portal.upsertMapping(dto, user.sub ?? user.id); }
}
