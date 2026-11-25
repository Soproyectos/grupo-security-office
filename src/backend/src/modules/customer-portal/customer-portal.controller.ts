import { AssignPortalTierDto, PortalTierDto } from './dto/portal-tier.dto';
import { Body, Controller, ForbiddenException, Optional, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfigService } from '@nestjs/config';
import { SuspendPortalAccountDto, UpdatePortalProfileDto } from './dto/portal-profile.dto';
import { DeletePortalAccountDto } from './dto/delete-portal-account.dto';
import { isProfileComplete, portalAccountView } from './portal-profile';
import { PortalAuthService } from './portal-auth/portal-auth.service';
import { CreatePortalPasswordDto } from './dto/create-portal-password.dto';

/** Revisión de cuentas: única matríz autorizada para aprobar/rechazar (PORTAL-02). */
const REVIEW_ROLES = [ROLE.SUPER_ADMIN];
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
  constructor(private readonly portal: CustomerPortalService, private readonly config: ConfigService, @Optional() private readonly portalAuth?: PortalAuthService) {}
  private isProd() { return this.config.get<string>('NODE_ENV') === 'production'; }
  private requireCompleteProfile(req: any) {
    if (!isProfileComplete(req.portalAccount)) throw new ForbiddenException({ code: 'PROFILE_INCOMPLETE', message: 'Completa tus datos para continuar' });
  }
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

  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('customer/catalog/products')
  customerCatalog(@Query() query: CatalogQueryDto, @Req() req: any) { this.requireCompleteProfile(req); return this.portal.getCatalog(query, req.portalAccount.type, req.portalAccount.tierId); }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('customer/catalog/products/:id')
  customerProductDetail(@Param('id') id: string, @Req() req: any) { this.requireCompleteProfile(req); return this.portal.getProductDetail(id, req.portalAccount.type, req.portalAccount.tierId); }

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
  @Get('admin/accounts') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  accounts() {return this.portal.listAccounts();}
  @Get('admin/tiers') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  tiers() {return this.portal.listTiers();}
  @Post('admin/tiers') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  createTier(@Body() dto:PortalTierDto,@CurrentUser() user:any) {return this.portal.saveTier(dto,user.sub??user.id);}
  @Patch('admin/tiers/:id') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  editTier(@Param('id') id:string,@Body() dto:PortalTierDto,@CurrentUser() user:any) {return this.portal.saveTier(dto,user.sub??user.id,id);}
  @Post('admin/accounts/:id/suspend') @HttpCode(HttpStatus.OK) @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  suspend(@Param('id') id:string,@Body() dto:SuspendPortalAccountDto,@CurrentUser() user:any) {return this.portal.suspend(id,dto.reason,user.sub??user.id);}
  @Post('admin/accounts/:id/reactivate') @HttpCode(HttpStatus.OK) @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  reactivate(@Param('id') id:string,@CurrentUser() user:any) {return this.portal.reactivate(id,user.sub??user.id);}
  @Patch('admin/accounts/:id/tier') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(ROLE.SUPER_ADMIN)
  assignTier(@Param('id') id:string,@Body() dto:AssignPortalTierDto,@CurrentUser() user:any) {return this.portal.assignTier(id,dto,user.sub??user.id);}

  /**
   * Recuperación de contraseña para clientes del portal.
   * - POST /api/customer-portal/accounts/forgot-password: solicitar enlace
   * - POST /api/customer-portal/accounts/reset-password: restablecer con token
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('accounts/forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar enlace de recuperación de contraseña' })
  @ApiResponse({ status: 200, description: 'Si la cuenta existe, se ha enviado un correo de recuperación.' })
  async requestPasswordReset(@Body() dto: ForgotPasswordRequestDto) {
    return this.portal.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('accounts/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  @ApiResponse({ status: 200, description: 'Contraseña restaurada correctamente' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.portal.resetPassword(dto.email, dto.token, dto.password);
  }

}
