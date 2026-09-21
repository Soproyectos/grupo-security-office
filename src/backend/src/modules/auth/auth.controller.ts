import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService, LoginStepResult, RequestMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto, MfaEnrollConfirmDto, MfaCodeDto } from './dto/mfa.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MfaService } from '../../common/security/mfa.service';
import { SessionService } from '../../common/security/session.service';

const SESSION_COOKIE = 'access_token';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private mfa: MfaService,
    private sessions: SessionService,
  ) {}

  private meta(req: Request): RequestMeta {
    return {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 255),
    };
  }

  private isProd(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  /**
   * `sameSite: 'strict'` en un panel administrativo: el navegador no adjunta la
   * cookie en peticiones originadas por otro sitio, lo que corta los ataques
   * CSRF en su origen. Con 'lax' (el valor anterior) una navegación de nivel
   * superior desde un sitio hostil sí la adjuntaba.
   */
  private setSessionCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'strict',
      expires: expiresAt,
      path: '/',
    });
  }

  private respond(res: Response, result: LoginStepResult) {
    if (result.status === 'COMPLETE') {
      this.setSessionCookie(res, result.token, result.expiresAt);
      return { status: result.status, user: result.user };
    }

    return { status: result.status, challengeToken: result.challengeToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paso 1: credenciales' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada, o segundo factor requerido' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 403, description: 'Cuenta bloqueada' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      dto.email,
      dto.password,
      this.meta(req),
    );

    return this.respond(res, result);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paso 2: código del segundo factor' })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfa(
      dto.challengeToken,
      dto.code,
      this.meta(req),
    );

    return this.respond(res, result);
  }

  /**
   * Enrolamiento obligatorio: sólo accesible con un token de desafío
   * `mfa-enroll`, es decir, por alguien que ya demostró conocer la contraseña.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mfa/enroll/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Genera el QR de enrolamiento del segundo factor' })
  async startEnrollment(@Body() dto: { challengeToken: string }) {
    const userId = this.authService.consumeChallenge(
      dto.challengeToken,
      'mfa-enroll',
    );
    const { email } = await this.authService.getProfile(userId);

    const enrollment = await this.mfa.startEnrollment(userId, email);

    // El secreto en claro no se devuelve al cliente salvo para mostrarlo como
    // alternativa al QR; nunca se registra en logs.
    return {
      qrDataUrl: enrollment.qrDataUrl,
      secret: enrollment.secret,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mfa/enroll/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma el enrolamiento y entrega códigos de respaldo' })
  async confirmEnrollment(
    @Body() dto: MfaEnrollConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, backupCodes } = await this.authService.completeEnrollment(
      dto.challengeToken,
      dto.code,
      this.meta(req),
    );

    return { ...this.respond(res, result), backupCodes };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil del usuario actual' })
  async getProfile(@CurrentUser() user: any) {
    const profile = await this.authService.getProfile(user.sub);
    const mfaState = await this.mfa.getState(user.sub);

    return {
      ...profile,
      mfa: {
        ...mfaState,
        required: this.mfa.isRequiredForRoles(profile.roles),
        backupCodesRemaining: await this.mfa.remainingBackupCodes(user.sub),
      },
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sesiones activas del usuario' })
  async listSessions(@CurrentUser() user: any) {
    const sessions = await this.sessions.listActive(user.sub);

    return sessions.map((s) => ({
      ...s,
      current: s.jti === user.jti,
    }));
  }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cierra las demás sesiones del usuario' })
  async revokeOtherSessions(@CurrentUser() user: any) {
    const revoked = await this.sessions.revokeAllForUser(
      user.sub,
      'ADMIN_REVOKE',
      user.jti,
    );

    return { revoked };
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactiva el segundo factor (exige un código válido)' })
  async disableMfa(@CurrentUser() user: any, @Body() dto: MfaCodeDto) {
    const profile = await this.authService.getProfile(user.sub);

    if (this.mfa.isRequiredForRoles(profile.roles)) {
      return {
        message:
          'El segundo factor es obligatorio para este rol y no puede desactivarse.',
        disabled: false,
      };
    }

    await this.mfa.disable(user.sub, dto.code);

    return { disabled: true };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.jti);

    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'strict',
      path: '/',
    });

    return { message: 'Sesión cerrada exitosamente' };
  }
}
